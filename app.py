from pathlib import Path
import math
import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
MODEL_PATH = MODEL_DIR / "energy_prediction_model.joblib"
ANOMALY_PATH = MODEL_DIR / "anomaly_model.joblib"
MEDIANS_PATH = MODEL_DIR / "feature_defaults.json"

app = Flask(__name__, static_folder="static", static_url_path="")

def load_artifact(path):
    if not path.exists():
        return None
    return joblib.load(path)

def defaults():
    if MEDIANS_PATH.exists():
        import json
        return json.loads(MEDIANS_PATH.read_text(encoding="utf-8"))
    return {}

def require_models():
    pred = load_artifact(MODEL_PATH)
    anomaly = load_artifact(ANOMALY_PATH)
    if pred is None or anomaly is None:
        raise RuntimeError(
            "ML models are not trained yet. Run: python train_model.py"
        )
    return pred, anomaly

def appliance_summary(appliances):
    total_kwh = 0.0
    rows = []
    for a in appliances or []:
        qty = max(float(a.get("qty", 0)), 0)
        watts = max(float(a.get("watts", 0)), 0)
        hours = min(max(float(a.get("hours", 0)), 0), 24)
        kwh = qty * watts * hours * 30 / 1000
        total_kwh += kwh
        rows.append({
            "name": str(a.get("name", "Appliance")),
            "kwh_month": round(kwh, 2),
            "share_percent": 0.0,
        })
    if total_kwh:
        for row in rows:
            row["share_percent"] = round(row["kwh_month"] / total_kwh * 100, 1)
    rows.sort(key=lambda x: x["kwh_month"], reverse=True)
    return total_kwh, rows

def build_feature_row(payload):
    d = defaults()
    # Feature names match train_model.py.
    row = {}
    for key, default in d.items():
        row[key] = float(payload.get(key, default))
    # Time fields can be supplied directly or derived from ISO timestamp.
    if "date" in payload:
        ts = pd.to_datetime(payload["date"])
        row["hour"] = float(ts.hour)
        row["dayofweek"] = float(ts.dayofweek)
        row["month"] = float(ts.month)
    return pd.DataFrame([row])

@app.get("/")
def home():
    return send_from_directory(BASE_DIR / "static", "index.html")

@app.get("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "prediction_model": MODEL_PATH.exists(),
        "anomaly_model": ANOMALY_PATH.exists(),
    })

@app.post("/api/predict")
def predict():
    try:
        model, _ = require_models()
        payload = request.get_json(silent=True) or {}
        X = build_feature_row(payload)
        prediction = float(model.predict(X)[0])
        return jsonify({
            "predicted_appliances_wh_per_10min": round(max(prediction, 0), 2),
            "predicted_kwh_per_day": round(max(prediction, 0) * 144 / 1000, 3),
            "model": "Random Forest Regression trained on UCI Appliances Energy Prediction",
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

@app.post("/api/anomaly")
def anomaly():
    try:
        _, model = require_models()
        payload = request.get_json(silent=True) or {}
        X = build_feature_row(payload)
        label = int(model.predict(X)[0])  # -1 anomaly, 1 normal
        score = float(model.decision_function(X)[0])
        return jsonify({
            "is_anomaly": label == -1,
            "anomaly_score": round(score, 4),
            "message": (
                "Unusual energy/environment pattern detected."
                if label == -1 else
                "Pattern is within the learned normal range."
            ),
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

@app.post("/api/agent/analyze")
def agent_analyze():
    try:
        payload = request.get_json(silent=True) or {}
        appliances = payload.get("appliances", [])
        tariff = max(float(payload.get("tariff", 7)), 0)
        ef = max(float(payload.get("ef", 0.71)), 0)
        target = min(max(float(payload.get("target", 20)), 0), 90)

        total_kwh, rows = appliance_summary(appliances)

        recommendations = []
        for a in appliances:
            name = str(a.get("name", "Appliance"))
            kind = str(a.get("kind", "other"))
            qty = max(float(a.get("qty", 1)), 0)
            watts = max(float(a.get("watts", 0)), 0)
            hours = min(max(float(a.get("hours", 0)), 0), 24)
            base = qty * watts * hours * 30 / 1000

            if base <= 0.5:
                continue
            if kind == "ac":
                saving = base * 0.10
                recommendations.append({
                    "title": f"Raise {name} to 25 °C",
                    "reason": "A warmer cooling setpoint can reduce cooling demand while maintaining comfort.",
                    "saving_kwh_month": round(saving, 2),
                    "upfront_cost": 0,
                    "effort": "free",
                })
            elif kind in {"bulb", "cfl"} and watts > 12:
                saving = qty * (watts - 9) * hours * 30 / 1000
                recommendations.append({
                    "title": f"Replace {name} with 9 W LED bulbs",
                    "reason": "LED lighting provides similar illumination at substantially lower wattage.",
                    "saving_kwh_month": round(saving, 2),
                    "upfront_cost": round(90 * qty),
                    "effort": "small",
                })
            elif kind == "fan" and watts > 40:
                saving = qty * (watts - 28) * hours * 30 / 1000
                recommendations.append({
                    "title": f"Consider BLDC fans for {name}",
                    "reason": "BLDC fans can deliver airflow with lower electrical power.",
                    "saving_kwh_month": round(saving, 2),
                    "upfront_cost": round(3000 * qty),
                    "effort": "invest",
                })
            elif kind == "standby" and hours >= 20:
                saving = qty * watts * 8 * 30 / 1000
                recommendations.append({
                    "title": "Switch off always-on devices at night",
                    "reason": "Removing unnecessary standby hours reduces idle consumption.",
                    "saving_kwh_month": round(saving, 2),
                    "upfront_cost": 400,
                    "effort": "small",
                })
            elif kind == "pc":
                recommendations.append({
                    "title": f"Enable sleep mode on {name}",
                    "reason": "Automatic sleep reduces energy use during idle periods.",
                    "saving_kwh_month": round(base * 0.20, 2),
                    "upfront_cost": 0,
                    "effort": "free",
                })

        recommendations.sort(
            key=lambda r: (
                -(r["saving_kwh_month"] / max(r["upfront_cost"], 1)),
                -r["saving_kwh_month"],
            )
        )

        need = total_kwh * target / 100
        selected, saved = [], 0.0
        for r in recommendations:
            if saved >= need:
                break
            selected.append(r)
            saved += r["saving_kwh_month"]

        prediction = None
        anomaly_result = None
        if MODEL_PATH.exists() and ANOMALY_PATH.exists():
            pred_model, anomaly_model = require_models()
            X = build_feature_row(payload)
            pred = max(float(pred_model.predict(X)[0]), 0)
            score = float(anomaly_model.decision_function(X)[0])
            label = int(anomaly_model.predict(X)[0])
            prediction = {
                "appliances_wh_per_10min": round(pred, 2),
                "kwh_per_day": round(pred * 144 / 1000, 3),
            }
            anomaly_result = {
                "is_anomaly": label == -1,
                "score": round(score, 4),
            }

        return jsonify({
            "agent": "Energy Optimization Agent",
            "summary": {
                "monthly_kwh": round(total_kwh, 2),
                "monthly_cost": round(total_kwh * tariff, 2),
                "monthly_co2_kg": round(total_kwh * ef, 2),
                "target_kwh_saved": round(need, 2),
                "planned_kwh_saved": round(saved, 2),
                "target_coverage_percent": round(
                    min(100, saved / need * 100) if need else 0, 1
                ),
            },
            "top_loads": rows[:8],
            "recommendations": recommendations[:10],
            "selected_plan": selected,
            "ml_prediction": prediction,
            "anomaly": anomaly_result,
        })
    except Exception as exc:
        return jsonify({"error": str(exc)}), 400

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
