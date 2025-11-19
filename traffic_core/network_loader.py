import networkx as nx
import osmnx as ox
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

# Performance optimizations
ox.settings.use_cache = True
ox.settings.log_console = False

# Load Yerevan road network with caching
@lru_cache(maxsize=1)
def load_road_network():
    """Load and cache the road network"""
    logger.info("Loading Yerevan road network...")
    north, south, east, west = 40.192, 40.175, 44.531, 44.503
    G = ox.graph_from_bbox(north, south, east, west, network_type="drive", simplify=True)
    
    # Precompute edge data for faster access
    for u, v, k, data in G.edges(keys=True, data=True):
        if 'length' not in data:
            data['length'] = 100
        
        # Precompute road type
        road_type = data.get('highway', 'residential')
        if isinstance(road_type, list):
            data['_road_type'] = road_type[0] if road_type else 'residential'
        else:
            data['_road_type'] = road_type
    
    logger.info(f"Road network loaded: {len(G.nodes())} nodes, {len(G.edges())} edges")
    return G

# Initialize graph
G = load_road_network()