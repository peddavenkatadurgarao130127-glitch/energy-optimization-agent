# Energy Optimization Agent

SDG 13 – Climate Action project: an agentic energy optimization prototype.

## Architecture

Browser UI → Flask API → ML prediction + anomaly detection + recommendation agent

### Components

- `static/index.html` — existing Energy Optimization Agent frontend
- `app.py` — Flask backend/API
- `train_model.py` — downloads and trains models on the UCI Appliances Energy Prediction dataset
- `models/` — generated model artifacts
- `data/raw/` — dataset
- `/api/agent/analyze` — orchestration endpoint used by the UI
- `/api/predict` — Random Forest energy prediction
- `/api/anomaly` — Isolation Forest anomaly detection

## Setup on Windows

Open the project folder in VS Code:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Train the models:

```powershell
python train_model.py
```

Start the application:

```powershell
python app.py
```

Open:

```text
http://127.0.0.1:5000
```

## Dataset

The training script downloads the UCI **Appliances Energy Prediction** dataset automatically if
`data/raw/energydata.csv` is not present.

The dataset is a time-series regression dataset from a low-energy building. It should be
described as a prototype/training dataset, not as campus-specific data.

## What makes this more than a calculator?

1. Random Forest predicts appliance energy consumption from sensor/weather/time features.
2. Isolation Forest detects unusual multivariate energy/environment patterns.
3. The agent endpoint combines measured appliance loads, ML results, anomaly status, and
   recommendations into one response.
4. The frontend remains the original website; the backend adds the intelligence layer.

## Important

The recommendations are decision-support estimates, not guarantees. Electricity tariffs,
CO₂ factors, appliance efficiency, and savings vary by location and equipment.
