from bc_frappe_sync.sync_manager import SyncManager
from bc_frappe_sync.bc_client import BusinessCentralClient
import logging
import argparse

# Configure logging to show output
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def print_sync_results(stats, sync_type):
    """Print formatted sync results for a specific type."""
    # Convert sync type to the correct key format
    stats_key = sync_type.lower().replace(' ', '_')
    
    print(f"\n{sync_type} Sync Results:")
    print("-" * (len(sync_type) + 14))
    print(f"Total {sync_type.lower()} processed: {stats[stats_key]['total']}")
    print(f"Created: {stats[stats_key]['created']}")
    print(f"Updated: {stats[stats_key]['updated']}")
    print(f"Failed: {stats[stats_key]['failed']}")
    
    if stats[stats_key]['errors']:
        print(f"\n{sync_type} Errors:")
        for error in stats[stats_key]['errors']:
            print(f"- {error}")

def main():
    parser = argparse.ArgumentParser(description='Sync data between Business Central and Frappe')
    parser.add_argument('--type', choices=['leave_types', 'employees', 'all'], 
                      default='all', help='Type of sync to perform')
    args = parser.parse_args()

    print("Initializing sync process...")
    bc_client = BusinessCentralClient()
    sync_manager = SyncManager(bc_client)
    
    if args.type in ['leave_types', 'all']:
        print("\nStarting leave type sync process...")
        stats = sync_manager.sync_all_leave_types()
        print_sync_results(stats, 'Leave Types')
    
    if args.type in ['employees', 'all']:
        print("\nStarting employee sync process...")
        stats = sync_manager.sync_all_employees()
        print_sync_results(stats, 'Employees')

if __name__ == "__main__":
    main() 