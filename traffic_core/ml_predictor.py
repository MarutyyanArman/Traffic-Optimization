import numpy as np
import joblib
import os
import random
import threading
from functools import lru_cache

# ML model storage with thread safety
MODELS_DIR = "ml_models"
os.makedirs(MODELS_DIR, exist_ok=True)
_model_lock = threading.Lock()

class TrafficPredictor:
    def __init__(self):
        self.model = None
        self.is_trained = False
        self.prediction_cache = {}
        
    def generate_training_data(self, n_samples=5000):
        """Generate training data"""
        features = []
        targets = []
        
        for _ in range(n_samples):
            hour = random.randint(0, 23)
            day_type = random.choice([0, 1])
            road_type_idx = random.choice([0, 1, 2, 3])
            length = random.uniform(50, 1000)
            
            is_rush_hour = 1 if (7 <= hour <= 9 or 17 <= hour <= 19) else 0
            is_night = 1 if (0 <= hour <= 5) else 0
            
            base_congestion = [0.2, 0.3, 0.4, 0.5][road_type_idx]
            
            if day_type == 0:  # Weekday
                if is_rush_hour:
                    base_congestion += 0.25
                elif is_night:
                    base_congestion -= 0.3
            else:  # Weekend
                if 11 <= hour <= 16:
                    base_congestion += 0.15
                elif is_night:
                    base_congestion -= 0.25
            
            base_congestion += random.uniform(-0.1, 0.1)
            base_congestion = max(0.05, min(0.95, base_congestion))
            
            features.append([hour, day_type, road_type_idx, length, is_rush_hour, is_night])
            targets.append(base_congestion)
        
        return np.array(features), np.array(targets)
    
    def train_model(self):
        """Train model with optimized parameters"""
        from sklearn.ensemble import RandomForestRegressor
        
        X, y = self.generate_training_data(5000)
        
        self.model = RandomForestRegressor(
            n_estimators=30,
            max_depth=8,
            random_state=42,
            n_jobs=-1
        )
        
        self.model.fit(X, y)
        self.is_trained = True
        
        model_path = os.path.join(MODELS_DIR, "random_forest_model.pkl")
        with _model_lock:
            joblib.dump(self.model, model_path)
        
        return self.model
    
    def load_model(self):
        """Load trained model"""
        model_path = os.path.join(MODELS_DIR, "random_forest_model.pkl")
        if os.path.exists(model_path):
            with _model_lock:
                self.model = joblib.load(model_path)
            self.is_trained = True
            return True
        return False
    
    def predict_congestion(self, hour, day_type, road_type, length):
        """Predict congestion with caching"""
        cache_key = f"{hour}_{day_type}_{road_type}_{length}"
        
        if cache_key in self.prediction_cache:
            return self.prediction_cache[cache_key]
        
        if not self.is_trained:
            if not self.load_model():
                self.train_model()
        
        road_type_encoded = {
            'motorway': 0, 'primary': 1, 'secondary': 2, 'residential': 3
        }.get(road_type, 2)
        
        is_rush_hour = 1 if (7 <= hour <= 9 or 17 <= hour <= 19) else 0
        is_night = 1 if (0 <= hour <= 5) else 0
        
        features = np.array([[hour, day_type, road_type_encoded, length, is_rush_hour, is_night]])
        prediction = self.model.predict(features)[0]
        prediction = max(0.05, min(0.95, prediction))
        
        # Cache the prediction
        self.prediction_cache[cache_key] = prediction
        if len(self.prediction_cache) > 10000:
            self.prediction_cache.clear()
        
        return prediction

# Initialize ML predictor
ml_predictor = TrafficPredictor()

# Train ML model in background thread
def train_ml_model_async():
    """Train ML model in background"""
    def train():
        try:
            ml_predictor.train_model()
            print("ML model trained successfully in background")
        except Exception as e:
            print(f"Background ML model training failed: {e}")
    
    thread = threading.Thread(target=train, daemon=True)
    thread.start()

# Start background training
train_ml_model_async()