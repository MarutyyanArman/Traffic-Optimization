import random
import numpy as np
import json
import os
from datetime import datetime
from collections import defaultdict

# Precomputed values for performance
SPEED_LIMITS = {
    'motorway': 90, 'motorway_link': 60, 'trunk': 80, 'trunk_link': 50,
    'primary': 60, 'primary_link': 50, 'secondary': 50, 'secondary_link': 40,
    'tertiary': 40, 'tertiary_link': 30, 'residential': 30, 'unclassified': 40, 'service': 20
}

# Updated congestion weights for more realistic levels
CONGESTION_WEIGHTS = {
    'motorway': 0.15, 'motorway_link': 0.2, 'trunk': 0.25, 'trunk_link': 0.3,
    'primary': 0.35, 'primary_link': 0.4, 'secondary': 0.45, 'secondary_link': 0.5,
    'tertiary': 0.55, 'tertiary_link': 0.6, 'residential': 0.65, 'unclassified': 0.5, 'service': 0.7
}

DELAY_WEIGHTS = {
    'motorway': 2, 'motorway_link': 5, 'trunk': 8, 'trunk_link': 10,
    'primary': 15, 'primary_link': 20, 'secondary': 25, 'secondary_link': 30,
    'tertiary': 35, 'residential': 40
}

# Historical data storage for pattern analysis
HISTORICAL_DATA_FILE = "historical_traffic_data.json"

def load_historical_data():
    """Load historical traffic data"""
    if os.path.exists(HISTORICAL_DATA_FILE):
        with open(HISTORICAL_DATA_FILE, 'r') as f:
            return json.load(f)
    return {"hourly_patterns": {}, "daily_patterns": {}, "road_patterns": {}}

def save_historical_data(data):
    """Save historical traffic data"""
    with open(HISTORICAL_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

# Initialize historical data
historical_data = load_historical_data()

def update_historical_data(hour, day_type, congestion_data):
    """Update historical data with current congestion patterns"""
    # Update hourly patterns
    hour_key = str(hour)
    if hour_key not in historical_data["hourly_patterns"]:
        historical_data["hourly_patterns"][hour_key] = []
    
    historical_data["hourly_patterns"][hour_key].append({
        "timestamp": datetime.now().isoformat(),
        "avg_congestion": np.mean([r.get('congestion', 0.5) for r in congestion_data]) if congestion_data else 0.5,
        "day_type": day_type
    })
    
    # Keep only last 100 records per hour to prevent file from growing too large
    if len(historical_data["hourly_patterns"][hour_key]) > 100:
        historical_data["hourly_patterns"][hour_key] = historical_data["hourly_patterns"][hour_key][-100:]
    
    save_historical_data(historical_data)

def enhanced_simulate_congestion(G, hour=None, day_type="weekday"):
    """Optimized congestion simulation using vectorized operations where possible"""
    congestion_data = []
    for u, v, k, data in G.edges(keys=True, data=True):
        base_congestion = get_realistic_congestion(data, hour, day_type)
        data['congestion'] = max(0.05, min(0.95, base_congestion))
        congestion_data.append({"congestion": data['congestion']})
    
    # Update historical data
    if hour is not None:
        update_historical_data(hour, day_type, congestion_data)
    
    return G

def get_realistic_congestion(edge_data, hour, day_type):
    """Optimized congestion calculation with more realistic coefficients"""
    road_type = edge_data.get('_road_type', 'residential')
    base = CONGESTION_WEIGHTS.get(road_type, 0.5)
    
    if hour is not None:
        if day_type == "weekday":
            if 7 <= hour <= 9:    # Morning rush
                base += random.uniform(0.25, 0.4)
            elif 17 <= hour <= 19: # Evening rush
                base += random.uniform(0.3, 0.45)
            elif 12 <= hour <= 14: # Lunch time
                base += random.uniform(0.1, 0.2)
            elif 0 <= hour <= 5:   # Night - significantly reduced congestion
                base -= random.uniform(0.25, 0.4)
        else:  # Weekend
            if 11 <= hour <= 16:   # Weekend daytime
                base += random.uniform(0.15, 0.25)
            elif 19 <= hour <= 22: # Weekend evening
                base += random.uniform(0.1, 0.2)
            elif 0 <= hour <= 6:   # Weekend night - significantly reduced congestion
                base -= random.uniform(0.2, 0.35)
    
    base += random.uniform(-0.08, 0.08)
    return max(0.05, min(0.95, base))

def simulate_congestion(G, hour=None):
    """Backward compatibility wrapper"""
    return enhanced_simulate_congestion(G, hour, "weekday")

def predict_future_congestion(hour, day_type, days_ahead=0):
    """Predict congestion for future times based on historical patterns"""
    # Base prediction using current algorithm
    base_prediction = get_realistic_congestion({}, hour, day_type)
    
    # Adjust based on historical data if available
    hour_key = str(hour)
    if hour_key in historical_data["hourly_patterns"]:
        hour_data = historical_data["hourly_patterns"][hour_key]
        similar_days = [d for d in hour_data if d.get('day_type') == day_type]
        
        if similar_days:
            historical_avg = np.mean([d['avg_congestion'] for d in similar_days[-10:]])  # Last 10 similar periods
            # Blend current prediction with historical data
            base_prediction = (base_prediction + historical_avg) / 2
    
    # Adjust for special conditions (weekends, holidays, etc.)
    if day_type == "weekend" and 11 <= hour <= 16:
        base_prediction += 0.1  # Weekend afternoons are busier
    
    return max(0.05, min(0.95, base_prediction))