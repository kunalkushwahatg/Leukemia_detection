import requests
import os

# --- Configuration ---
API_URL = "http://127.0.0.1:8000/predict"
IMAGE_FILE_PATH = "images/1001.bmp" # Change this to your image file
# You might need to adjust the content type based on your image
IMAGE_MIME_TYPE = "image/bmp" # e.g., "image/jpeg", "image/png"

def call_leukemia_api(image_path: str, mime_type: str):
    if not os.path.exists(image_path):
        print(f"Error: Image file not found at '{image_path}'")
        return

    try:
        with open(image_path, "rb") as image_file:
            files = {"file": (os.path.basename(image_path), image_file, mime_type)}
            print(f"Sending request to {API_URL} with file: {image_path}")
            response = requests.post(API_URL, files=files)

        response.raise_for_status()  # Raise an exception for HTTP errors (4xx or 5xx)

        print("\n--- API Response ---")
        print(response.json())

    except requests.exceptions.ConnectionError as e:
        print(f"Error: Could not connect to the API server. Is it running at {API_URL}? {e}")
    except requests.exceptions.RequestException as e:
        print(f"Error during API call: {e}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response content: {e.response.text}")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":

    call_leukemia_api(IMAGE_FILE_PATH, IMAGE_MIME_TYPE)