"""Server-side connector to the inventory shipment export."""
import os
import re
import requests
from flask import Blueprint, jsonify, request

inventory_integration = Blueprint('inventory_integration', __name__)

@inventory_integration.get('/api/inventory/in-transit')
def in_transit_report():
    base = os.getenv('INVENTORY_BACKEND_URL', '').rstrip('/')
    key = os.getenv('INVENTORY_INTEGRATION_API_KEY', '')
    if not base or not key:
        return jsonify(success=False, message='Inventory backend integration is not configured.'), 503
    params = {}
    for field in ('companyId', 'portalId'):
        value = request.args.get(field)
        if value is not None:
            if not re.fullmatch(r'[a-fA-F0-9]{24}', value):
                return jsonify(success=False, message=f'Invalid {field}.'), 400
            params[field] = value
    company = request.args.get('organization')
    if company is not None:
        if company not in ('rayom', 'linso'):
            return jsonify(success=False, message='VC transit is available for Energizer and LINSO.'), 400
        for field, suffix in (('companyId', 'COMPANY_ID'), ('portalId', 'PORTAL_ID')):
            value = os.getenv(f'INVENTORY_{company.upper()}_{suffix}', '')
            if not re.fullmatch(r'[a-fA-F0-9]{24}', value):
                return jsonify(success=False, message='Inventory company/portal mapping is not configured.'), 503
            params[field] = value
    include_unknown = request.args.get('includeUnknown', 'true')
    if include_unknown not in ('true', 'false'):
        return jsonify(success=False, message='includeUnknown must be true or false.'), 400
    params['includeUnknown'] = include_unknown
    try:
        response = requests.get(base + '/api/integrations/in-transit', params=params,
                                headers={'Authorization': 'Bearer ' + key, 'Accept': 'application/json'},
                                timeout=(5, 60), allow_redirects=False)
        if response.status_code != 200:
            return jsonify(success=False, message='Inventory export is unavailable. Check the inventory server and integration configuration.'), 502
        data = response.json()
        if not isinstance(data, dict) or data.get('success') is not True or not all(field in data for field in ('summary', 'products', 'shipments')):
            raise ValueError('Invalid inventory response')
        if company is not None:
            if any(str(row.get(field, '')) != params[field] for row in data['shipments'] for field in ('companyId', 'portalId')):
                raise ValueError('Inventory response contains another company or portal')
            data['vendorAccount'] = {'rayom': 'cb', 'linso': 'mvr'}[company]
        result = jsonify(data)
        result.headers['Cache-Control'] = 'no-store'
        return result
    except (requests.RequestException, ValueError):
        return jsonify(success=False, message='Could not fetch the complete inventory report. Check the inventory backend connection.'), 502
