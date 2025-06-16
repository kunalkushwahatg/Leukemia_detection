import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.checkpoint import checkpoint

class SEBlock(nn.Module):
    def __init__(self, in_channels, reduction=16):
        super(SEBlock, self).__init__()
        self.global_avg_pool = nn.AdaptiveAvgPool2d(1)
        self.fc1 = nn.Linear(in_channels, in_channels // reduction, bias=False)
        self.relu = nn.ReLU()
        self.fc2 = nn.Linear(in_channels // reduction, in_channels, bias=False)
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        batch_size, channels, _, _ = x.size()
        y = self.global_avg_pool(x).view(batch_size, channels)
        y = self.relu(self.fc1(y))
        y = self.sigmoid(self.fc2(y)).view(batch_size, channels, 1, 1)
        return x * y


class ConvolutionalTokenEmbedding(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, stride, padding):
        super().__init__()
        self.depthwise = nn.Conv2d(in_channels, in_channels, kernel_size, stride, padding, groups=in_channels)
        self.pointwise = nn.Conv2d(in_channels, out_channels, 1, 1, 0)
        self.layer_norm = nn.LayerNorm(out_channels)

    def forward(self, x):
        x = self.depthwise(x)
        x = self.pointwise(x)
        b, c, h, w = x.size()
        x = x.permute(0, 2, 3, 1).reshape(b, h * w, c)
        x = self.layer_norm(x)
        return x, h, w


class SparseSelfAttention(nn.Module):
    def __init__(self, dim, num_heads=4, window_size=32):
        super().__init__()
        self.num_heads = num_heads
        self.window_size = window_size
        self.scale = (dim // num_heads) ** -0.5
        self.qkv = nn.Linear(dim, dim * 3)
        self.proj = nn.Linear(dim, dim)

    def forward(self, x):
        B, N, C = x.shape
        qkv = self.qkv(x).reshape(B, N, 3, self.num_heads, C // self.num_heads).permute(2, 0, 3, 1, 4)
        q, k, v = qkv[0], qkv[1], qkv[2]

        # Ensure N is a multiple of window_size for reshaping
        if N % self.window_size != 0:
            # Handle cases where N is not perfectly divisible
            # For simplicity in this deployment, we'll pad or truncate if absolutely necessary,
            # but ideally, input resolution should be chosen such that N is divisible.
            # Here, we'll just raise an error as a safety check.
            raise ValueError(f"Input sequence length N ({N}) must be divisible by window_size ({self.window_size})")

        q = q.contiguous().view(B, self.num_heads, N // self.window_size, self.window_size, -1)
        k = k.contiguous().view(B, self.num_heads, N // self.window_size, self.window_size, -1)
        v = v.contiguous().view(B, self.num_heads, N // self.window_size, self.window_size, -1)

        attn = (q @ k.transpose(-2, -1)) * self.scale
        attn = F.softmax(attn, dim=-1)
        x = (attn @ v).reshape(B, N, C)
        x = self.proj(x)
        return x


class ConvolutionalTransformerBlock(nn.Module):
    def __init__(self, dim, mlp_ratio=2.0, window_size=32):
        super().__init__()
        self.norm1 = nn.LayerNorm(dim)
        self.attn = SparseSelfAttention(dim, window_size=window_size)
        self.norm2 = nn.LayerNorm(dim)
        self.mlp = nn.Sequential(
            nn.Linear(dim, int(dim * mlp_ratio)),
            nn.GELU(),
            nn.Linear(int(dim * mlp_ratio), dim),
        )

    def _attn_block(self, x):
        return self.attn(x)

    def _mlp_block(self, x):
        return self.mlp(x)

    def forward(self, x):
        x = x + checkpoint(self._attn_block, self.norm1(x))
        x = x + checkpoint(self._mlp_block, self.norm2(x))
        return x


class DropBlock2D(nn.Module):
    def __init__(self, block_size=3, drop_prob=0.1):
        super(DropBlock2D, self).__init__()
        self.block_size = block_size
        self.drop_prob = drop_prob

    def forward(self, x):
        if not self.training or self.drop_prob == 0:
            return x

        gamma = self.drop_prob / (self.block_size ** 2)
        mask = (torch.rand(x.shape[0], 1, x.shape[2], x.shape[3], device=x.device) < gamma).float()
        mask = F.max_pool2d(mask, kernel_size=(self.block_size, self.block_size), stride=(1, 1), padding=self.block_size // 2)
        mask = 1 - mask
        x = x * mask * (mask.numel() / mask.sum())
        return x


class LeukemiaCvTModel(nn.Module):
    def __init__(self, in_channels=3, num_classes=2):
        super().__init__()

        # Stage 1
        self.stage1_embed = ConvolutionalTokenEmbedding(in_channels, 32, kernel_size=7, stride=1, padding=3)
        self.stage1_transformer = ConvolutionalTransformerBlock(32, window_size=32)
        self.se1 = SEBlock(32)
        self.dropblock1 = DropBlock2D(block_size=3, drop_prob=0.1)

        # Stage 2
        self.stage2_embed = ConvolutionalTokenEmbedding(32, 96, kernel_size=3, stride=2, padding=1)
        self.stage2_transformer = ConvolutionalTransformerBlock(96, window_size=32)
        self.se2 = SEBlock(96)
        self.dropblock2 = DropBlock2D(block_size=3, drop_prob=0.1)

        # Stage 3
        self.stage3_embed = ConvolutionalTokenEmbedding(96, 192, kernel_size=3, stride=4, padding=1)
        self.stage3_transformer = ConvolutionalTransformerBlock(192, window_size=14)
        self.se3 = SEBlock(192)
        self.dropblock3 = DropBlock2D(block_size=3, drop_prob=0.1)

        # Classification Head
        self.head = nn.Sequential(
            nn.LayerNorm(192),
            nn.Linear(192, num_classes),
        )

    def forward(self, x):
        # Stage 1
        b, c, h, w = x.size()
        x1, h1, w1 = self.stage1_embed(x)
        x1 = self.stage1_transformer(x1)
        x1 = x1.permute(0, 2, 1).reshape(b, 32, h1, w1)
        x1 = self.se1(x1)
        x1 = self.dropblock1(x1)

        # Stage 2
        x2, h2, w2 = self.stage2_embed(x1)
        x2 = self.stage2_transformer(x2)
        x2 = x2.permute(0, 2, 1).reshape(b, 96, h2, w2)
        x2 = self.se2(x2)
        x2 = self.dropblock2(x2)

        # Stage 3
        x3, h3, w3 = self.stage3_embed(x2)
        x3 = self.stage3_transformer(x3)
        x3 = x3.permute(0, 2, 1).reshape(b, 192, h3, w3)
        x3 = self.se3(x3)
        x3 = self.dropblock3(x3)

        # Classification
        x3 = x3.mean(dim=(2, 3))
        x3 = self.head(x3)
        return x3
    

if __name__ == "__main__":
    model = LeukemiaCvTModel()
    print(model)
    x = torch.randn(1, 3, 224, 224)  # Example input
    output = model(x)
    print(output.shape)  # Should print torch.Size([1, 2]) for num_classes=2
    