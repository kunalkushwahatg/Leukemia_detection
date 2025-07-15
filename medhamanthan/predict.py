import torch
from PIL import Image
from io import BytesIO
from model import LeukemiaCvTModel
from utils import get_inference_transform

class LeukemiaPredictor:
    def __init__(self, model_path: str, device: str = None):
        self.device = device if device else ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = self._load_model(model_path)
        self.transform = get_inference_transform()
        self.class_names = ["Healthy", "Leukemia"] # Assuming 0 for Healthy, 1 for Leukemia

    def _load_model(self, model_path: str):
        model = LeukemiaCvTModel(num_classes=2)
        model.load_state_dict(torch.load(model_path, map_location=self.device))
        model.to(self.device)
        model.eval()
        return model

    def predict_image(self, image_bytes: bytes):
        try:
            image = Image.open(BytesIO(image_bytes)).convert("RGB")
            processed_image = self.transform(image).unsqueeze(0).to(self.device) # Add batch dimension

            with torch.no_grad():
                outputs = self.model(processed_image)
                probabilities = torch.softmax(outputs, dim=1)[0]
                predicted_class_idx = torch.argmax(probabilities).item()
                predicted_class_name = self.class_names[predicted_class_idx]
                confidence = probabilities[predicted_class_idx].item()

            return {
                "prediction": predicted_class_name,
                "confidence": confidence,
                "probabilities": {name: prob.item() for name, prob in zip(self.class_names, probabilities)}
            }
        except Exception as e:
            return {"error": f"Error during prediction: {str(e)}"}
        

if __name__ == "__main__":
    # Example usage
    predictor = LeukemiaPredictor(model_path="models/model_weights.pth")
    with open("images/1.bmp", "rb") as f:
        image_bytes = f.read()
    result = predictor.predict_image(image_bytes)
    print(result)
        
        