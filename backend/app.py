
from pathlib import Path
import io
import json

import numpy as np
import tensorflow as tf
from flask import Flask, jsonify, request,  send_from_directory
from flask_cors import CORS
from PIL import Image, ImageOps

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"

MODEL_PATH = BASE_DIR / "efficientnetb0_cardd_final.keras"
SETTINGS_PATH = BASE_DIR / "settings.json"

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024
CORS(app)

with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
    settings = json.load(f)

CLASS_NAMES = settings["classes"]
THRESHOLDS = settings["thresholds"]

print("Loading EfficientNetB0 model...")

model = tf.keras.models.load_model(
    str(MODEL_PATH),
    compile=False
)

print("MODEL LOADED SUCCESSFULLY")
print("Input:", model.input_shape)
print("Output:", model.output_shape)



@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:filename>")
def frontend_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)


@app.route("/health")
def health():
    return jsonify({
        "message": "VehDetect AI backend is running",
        "model_loaded": True,
        "classes": CLASS_NAMES
    })



@app.route("/predict", methods=["POST"])
def predict():
    if "image" not in request.files:
        return jsonify({"error": "No image uploaded"}), 400

    file = request.files["image"]

    if not file.filename:
        return jsonify({"error": "No file selected"}), 400

    if Path(file.filename).suffix.lower() not in (
        ".jpg", ".jpeg", ".png"
    ):
        return jsonify({"error": "Only JPG and PNG allowed"}), 400

    try:
        image = Image.open(io.BytesIO(file.read()))
        image = ImageOps.exif_transpose(image).convert("RGB")

        # Match EfficientNetB0 training input dimensions.
        image = image.resize((224, 224), Image.Resampling.BILINEAR)

        # Keep pixel values in the 0-255 range.
        # EfficientNetB0 includes its own preprocessing.
        image_array = np.asarray(image, dtype=np.float32)
        image_batch = np.expand_dims(image_array, axis=0)

        scores = model.predict(image_batch, verbose=0)[0]
        scores = [float(x) for x in scores]

        predictions = []

        for name, score in zip(CLASS_NAMES, scores):
            threshold = float(THRESHOLDS[name])

            predictions.append({
                "name": name,
                "confidence": score,
                "threshold": threshold,
                "detected": score >= threshold
            })

        return jsonify({
            "message": "Prediction completed",
            "scores": scores,
            "predictions": predictions
        })

    except Exception as error:
        app.logger.exception("Prediction failed")
        return jsonify({
            "error": "Unable to process image"
        }), 400


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False
    )
