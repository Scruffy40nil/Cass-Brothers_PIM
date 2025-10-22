"""
Rules Management API Routes
RESTful API for managing data cleaning rules
"""
from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)

# Create blueprint
rules_bp = Blueprint('rules', __name__, url_prefix='/api/rules')


def setup_rules_routes(app):
    """
    Setup rules management routes

    Routes:
        GET    /api/rules/<collection>/<rule_type>              - List all rules
        GET    /api/rules/<collection>/<rule_type>/<rule_id>    - Get specific rule
        POST   /api/rules/<collection>/<rule_type>              - Create new rule
        PUT    /api/rules/<collection>/<rule_type>/<rule_id>    - Update rule
        DELETE /api/rules/<collection>/<rule_type>/<rule_id>    - Delete rule
        POST   /api/rules/<collection>/<rule_type>/search       - Search rules
        POST   /api/rules/<collection>/<rule_type>/reorder      - Reorder rules
        GET    /api/rules/<collection>/metadata                 - Get rule metadata
    """

    from core.firestore_manager import get_firestore_manager
    from core.rules_manager import get_rules_manager

    @rules_bp.route('/<collection_name>/<rule_type>', methods=['GET'])
    def get_rules(collection_name, rule_type):
        """Get all rules for a collection and rule type"""
        try:
            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({'error': 'Firestore not initialized'}), 500

            rules_manager = get_rules_manager(firestore_manager.db)
            rules = rules_manager.get_all_rules(collection_name, rule_type)

            return jsonify({
                'success': True,
                'collection': collection_name,
                'rule_type': rule_type,
                'count': len(rules),
                'rules': rules
            })

        except Exception as e:
            logger.error(f"Error getting rules: {e}")
            return jsonify({'error': str(e)}), 500

    @rules_bp.route('/<collection_name>/<rule_type>/<rule_id>', methods=['GET'])
    def get_rule(collection_name, rule_type, rule_id):
        """Get a specific rule"""
        try:
            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({'error': 'Firestore not initialized'}), 500

            rules_manager = get_rules_manager(firestore_manager.db)
            rule = rules_manager.get_rule(collection_name, rule_type, rule_id)

            if rule:
                return jsonify({
                    'success': True,
                    'rule': rule
                })
            else:
                return jsonify({'error': 'Rule not found'}), 404

        except Exception as e:
            logger.error(f"Error getting rule: {e}")
            return jsonify({'error': str(e)}), 500

    @rules_bp.route('/<collection_name>/<rule_type>', methods=['POST'])
    def create_rule(collection_name, rule_type):
        """Create a new rule"""
        try:
            data = request.get_json()

            if not data or 'search_term' not in data or 'standard_value' not in data:
                return jsonify({'error': 'Missing required fields: search_term, standard_value'}), 400

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({'error': 'Firestore not initialized'}), 500

            rules_manager = get_rules_manager(firestore_manager.db)
            rule_id = rules_manager.create_rule(collection_name, rule_type, data)

            if rule_id:
                # Clear rules cache in rules engine
                from core.rules_engine import get_rules_engine
                rules_engine = get_rules_engine(firestore_manager.db)
                rules_engine.clear_cache()

                return jsonify({
                    'success': True,
                    'rule_id': rule_id,
                    'message': 'Rule created successfully'
                }), 201
            else:
                return jsonify({'error': 'Failed to create rule'}), 500

        except Exception as e:
            logger.error(f"Error creating rule: {e}")
            return jsonify({'error': str(e)}), 500

    @rules_bp.route('/<collection_name>/<rule_type>/<rule_id>', methods=['PUT'])
    def update_rule(collection_name, rule_type, rule_id):
        """Update an existing rule"""
        try:
            data = request.get_json()

            if not data:
                return jsonify({'error': 'No data provided'}), 400

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({'error': 'Firestore not initialized'}), 500

            rules_manager = get_rules_manager(firestore_manager.db)
            success = rules_manager.update_rule(collection_name, rule_type, rule_id, data)

            if success:
                # Clear rules cache in rules engine
                from core.rules_engine import get_rules_engine
                rules_engine = get_rules_engine(firestore_manager.db)
                rules_engine.clear_cache()

                return jsonify({
                    'success': True,
                    'message': 'Rule updated successfully'
                })
            else:
                return jsonify({'error': 'Failed to update rule'}), 500

        except Exception as e:
            logger.error(f"Error updating rule: {e}")
            return jsonify({'error': str(e)}), 500

    @rules_bp.route('/<collection_name>/<rule_type>/<rule_id>', methods=['DELETE'])
    def delete_rule(collection_name, rule_type, rule_id):
        """Delete a rule"""
        try:
            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({'error': 'Firestore not initialized'}), 500

            rules_manager = get_rules_manager(firestore_manager.db)
            success = rules_manager.delete_rule(collection_name, rule_type, rule_id)

            if success:
                # Clear rules cache in rules engine
                from core.rules_engine import get_rules_engine
                rules_engine = get_rules_engine(firestore_manager.db)
                rules_engine.clear_cache()

                return jsonify({
                    'success': True,
                    'message': 'Rule deleted successfully'
                })
            else:
                return jsonify({'error': 'Failed to delete rule'}), 500

        except Exception as e:
            logger.error(f"Error deleting rule: {e}")
            return jsonify({'error': str(e)}), 500

    @rules_bp.route('/<collection_name>/<rule_type>/search', methods=['POST'])
    def search_rules(collection_name, rule_type):
        """Search rules by query"""
        try:
            data = request.get_json()

            if not data or 'query' not in data:
                return jsonify({'error': 'Missing required field: query'}), 400

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({'error': 'Firestore not initialized'}), 500

            rules_manager = get_rules_manager(firestore_manager.db)
            results = rules_manager.search_rules(collection_name, rule_type, data['query'])

            return jsonify({
                'success': True,
                'query': data['query'],
                'count': len(results),
                'results': results
            })

        except Exception as e:
            logger.error(f"Error searching rules: {e}")
            return jsonify({'error': str(e)}), 500

    @rules_bp.route('/<collection_name>/<rule_type>/reorder', methods=['POST'])
    def reorder_rules(collection_name, rule_type):
        """Reorder rules by priority"""
        try:
            data = request.get_json()

            if not data or 'rule_ids' not in data:
                return jsonify({'error': 'Missing required field: rule_ids'}), 400

            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({'error': 'Firestore not initialized'}), 500

            rules_manager = get_rules_manager(firestore_manager.db)
            success = rules_manager.reorder_rules(collection_name, rule_type, data['rule_ids'])

            if success:
                # Clear rules cache in rules engine
                from core.rules_engine import get_rules_engine
                rules_engine = get_rules_engine(firestore_manager.db)
                rules_engine.clear_cache()

                return jsonify({
                    'success': True,
                    'message': 'Rules reordered successfully'
                })
            else:
                return jsonify({'error': 'Failed to reorder rules'}), 500

        except Exception as e:
            logger.error(f"Error reordering rules: {e}")
            return jsonify({'error': str(e)}), 500

    @rules_bp.route('/<collection_name>/metadata', methods=['GET'])
    def get_metadata(collection_name):
        """Get rule metadata for a collection"""
        try:
            firestore_manager = get_firestore_manager()
            if not firestore_manager.db:
                return jsonify({'error': 'Firestore not initialized'}), 500

            rules_manager = get_rules_manager(firestore_manager.db)
            metadata = rules_manager.get_rule_metadata(collection_name)

            if metadata:
                return jsonify({
                    'success': True,
                    'collection': collection_name,
                    'metadata': metadata
                })
            else:
                return jsonify({'error': 'Metadata not found'}), 404

        except Exception as e:
            logger.error(f"Error getting metadata: {e}")
            return jsonify({'error': str(e)}), 500

    # Register blueprint
    app.register_blueprint(rules_bp)

    logger.info("✅ Rules management routes registered")
