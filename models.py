"""
User models and authentication helpers using SQLAlchemy
"""
import uuid
import hashlib
import json
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

# Create SQLAlchemy instance
db = SQLAlchemy()

class User(db.Model):
    """User model for authentication"""
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(8), unique=True, nullable=False)  # Short display ID
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(64), nullable=False)  # SHA256 hash
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime, nullable=True)
    theme = db.Column(db.String(20), default='dark')
    notifications = db.Column(db.Boolean, default=True)
    
    def __repr__(self):
        return f'<User {self.email}>'
    
    def to_dict(self):
        """Convert user to dictionary (without password)"""
        return {
            "id": self.user_id,
            "email": self.email,
            "name": self.name,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None
        }


class TripHistory(db.Model):
    """Per-user trip history entries"""
    __tablename__ = 'trip_history'

    id = db.Column(db.Integer, primary_key=True)
    # Link to User.user_id (short ID stored in session)
    user_id = db.Column(db.String(8), nullable=False, index=True)

    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)

    start_lat = db.Column(db.Float, nullable=False)
    start_lng = db.Column(db.Float, nullable=False)
    start_label = db.Column(db.String(255), nullable=True)

    end_lat = db.Column(db.Float, nullable=False)
    end_lng = db.Column(db.Float, nullable=False)
    end_label = db.Column(db.String(255), nullable=True)

    route_type = db.Column(db.String(50), nullable=True)
    duration_min = db.Column(db.Float, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "start": {
                "lat": self.start_lat,
                "lng": self.start_lng,
                "label": self.start_label,
            },
            "end": {
                "lat": self.end_lat,
                "lng": self.end_lng,
                "label": self.end_label,
            },
            "route_type": self.route_type,
            "duration_min": self.duration_min,
        }


class SavedRoute(db.Model):
    """Per-user saved routes (replaces saved_routes.json file storage)."""
    __tablename__ = 'saved_routes'

    id = db.Column(db.String(36), primary_key=True)  # UUID string
    user_id = db.Column(db.String(8), nullable=False, index=True)

    name = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(50), nullable=False, default='smart_plan')

    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    updated_at = db.Column(db.DateTime, nullable=True)

    # JSON blobs stored as text for SQLite compatibility.
    route_data_json = db.Column(db.Text, nullable=False)
    start_point_json = db.Column(db.Text, nullable=True)
    end_point_json = db.Column(db.Text, nullable=True)

    def to_dict(self):
        def _loads(value):
            if not value:
                return None
            try:
                return json.loads(value)
            except Exception:
                return None

        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "type": self.type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "route_data": _loads(self.route_data_json) or {},
            "start_point": _loads(self.start_point_json),
            "end_point": _loads(self.end_point_json),
        }


def hash_password(password):
    """Simple password hashing"""
    return hashlib.sha256(password.encode()).hexdigest()


def generate_user_id():
    """Generate unique user ID"""
    return str(uuid.uuid4())[:8].upper()


def create_user(email, password, name=None):
    """Create a new user"""
    email = email.lower()
    
    # Check if email already exists
    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        return None, "Email already registered"
    
    user_id = generate_user_id()
    
    # Ensure unique user_id
    while User.query.filter_by(user_id=user_id).first():
        user_id = generate_user_id()
    
    new_user = User(
        user_id=user_id,
        email=email,
        password=hash_password(password),
        name=name or email.split('@')[0],
        created_at=datetime.utcnow()
    )
    
    db.session.add(new_user)
    db.session.commit()
    
    return new_user.to_dict(), None


def authenticate_user(email, password):
    """Authenticate a user"""
    email = email.lower()
    
    user = User.query.filter_by(email=email).first()
    if not user:
        return None, "User not found"
    
    if user.password != hash_password(password):
        return None, "Invalid password"
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.session.commit()
    
    return user.to_dict(), None


def get_user_by_id(user_id):
    """Get user by ID"""
    user = User.query.filter_by(user_id=user_id).first()
    if user:
        return user.to_dict()
    return None


def update_user(user_id, updates):
    """Update user information"""
    user = User.query.filter_by(user_id=user_id).first()
    if not user:
        return False
    
    for key, value in updates.items():
        if key == 'name':
            user.name = value
        elif key == 'theme':
            user.theme = value
        elif key == 'notifications':
            user.notifications = value
    
    db.session.commit()
    return True


def create_trip(user_id, trip_data):
    """Create a trip history entry for a user.

    trip_data expects keys: start_lat, start_lng, start_label,
    end_lat, end_lng, end_label, route_type (optional), duration_min (optional).
    """
    # Allow the frontend to send a simulated timestamp (based on the slider
    # time) via trip_data["created_at"]. If it's not provided or invalid,
    # fall back to the current UTC time.
    created_at_value = None
    created_at_str = trip_data.get("created_at")
    if created_at_str:
        try:
            created_at_value = datetime.fromisoformat(created_at_str)
        except Exception:
            created_at_value = None

    if created_at_value is None:
        created_at_value = datetime.utcnow()

    trip = TripHistory(
        user_id=user_id,
        created_at=created_at_value,
        start_lat=trip_data["start_lat"],
        start_lng=trip_data["start_lng"],
        start_label=trip_data.get("start_label"),
        end_lat=trip_data["end_lat"],
        end_lng=trip_data["end_lng"],
        end_label=trip_data.get("end_label"),
        route_type=trip_data.get("route_type"),
        duration_min=trip_data.get("duration_min"),
    )

    db.session.add(trip)
    db.session.commit()
    return trip.to_dict()


def get_trips_for_user(user_id):
    """Return all trip history entries for a user, newest first."""
    trips = (
        TripHistory.query
        .filter_by(user_id=user_id)
        .order_by(TripHistory.created_at.desc())
        .all()
    )
    return [t.to_dict() for t in trips]


def init_db(app):
    """Initialize database with app context"""
    db.init_app(app)
    with app.app_context():
        db.create_all()
        print("✅ Database initialized successfully")
