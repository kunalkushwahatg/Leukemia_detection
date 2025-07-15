# Leukemia Detection Using CNN

This repository contains an AI-powered solution for the early detection of Leukemia from blood smear images. Leveraging a Convolutional Neural Network (CNN), the model classifies input images as either Leukemia-positive or normal, aiming to assist healthcare professionals in rapid preliminary diagnostics.

## Demo Video

Demo : https://youtu.be/KLpIaKE_rCw

In this demo, the application is running on raspberry pi 5, ubuntu 22.04 server os. We are accessing the application through the device's ip in the local network in which the device is deployed. 
## Features

- **Deep Learning-Based Classification** of blood smear images for early Leukemia detection.
- **Lightweight CNN Architecture** optimized for low-resource environments such as Raspberry Pi.
- **Preprocessing and Data Augmentation Pipeline** to enhance model robustness and accuracy.
- **Modular CLI Scripts** for training, testing, and evaluating models on both desktop and edge devices.
- **Raspberry Pi Deployment Support** with compatibility for Docker-based runtime and service management via `systemd`.
- **Model Checkpointing** for saving and loading trained weights to enable quick redeployment or offline inference.

## Technologies Used

**Client Side:** Next.js + TypeScript  
**Server Side:** FastAPI


## Installation

To run it locally on your computer:

```bash
git clone https://github.com/HrushikeshAnandSarangi/Leukemia_model
cd Leukemia_model
docker build -t medhamanthan-app .
docker run -d --name medhamanthan-app -p 3000:3000 -p 8000:8000 medhamanthan-app
```
or pull it from docker hub:
```bash
docker run -d --name medhamanthan-app -p 3000:3000 -p 8000:8000 hrushi225/medhamanthan-final
```
    
---


## Deployment on Raspberry Pi (Ubuntu 22.04 or newer)

This application is optimized for deployment on a Raspberry Pi 4 or newer running **Ubuntu 22.04 (64-bit)**. The service runs inside a Docker container and is accessible on the local network via port `3000`. For stability and ease of access, we have also configured **Nginx as a reverse proxy** which makes it accessible to devices on the local network.

---

### Step 1: Install Docker

Update the system and install Docker Engine:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg lsb-release

sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

sudo systemctl enable docker
sudo systemctl start docker
````

(Optional) Add your user to the Docker group:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

### Step 2: Pull and Run the Docker Container

Pull the pre-built image from Docker Hub:

```bash
docker pull hrushi225/medhamanthan-final
```

Run the container:

```bash
docker run -d \
  --name medhamanthan-backend \
  --restart=always \
  -p 3000:3000 \
  hrushi225/medhamanthan-final
```

---

### Step 3: Enable Auto-Start with systemd

To ensure the container runs after a reboot, create a systemd service:

```bash
sudo nano /etc/systemd/system/medhamanthan.service
```

Paste the following content:

```ini
[Unit]
Description=Medhamanthan Backend Docker Service
After=network.target docker.service
Requires=docker.service

[Service]
ExecStart=/usr/bin/docker start -a medhamanthan-backend
ExecStop=/usr/bin/docker stop medhamanthan-backend
Restart=always
TimeoutStartSec=0
User=ubuntu

[Install]
WantedBy=multi-user.target
```

Then enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable medhamanthan.service
sudo systemctl start medhamanthan.service
```

---

### Step 4: Configure Nginx as a Reverse Proxy

Install Nginx:

```bash
sudo apt install nginx
sudo systemctl enable nginx
```

Create an Nginx configuration file:

```bash
sudo nano /etc/nginx/sites-available/medhamanthan
```

Paste the following configuration:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the configuration:

```bash
sudo ln -s /etc/nginx/sites-available/medhamanthan /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## Accessing the Application on the Local Network

Once deployed, you can access the application from any device connected to the same network using your Raspberry Pi’s IP address:

```
http://<raspberry-pi-ip>/
```

To find the IP address of your Raspberry Pi:

```bash
hostname -I
```

Example:

```
http://192.168.1.101/
```

The Nginx reverse proxy will forward requests on port `80` to your backend service running on port `3000`.

