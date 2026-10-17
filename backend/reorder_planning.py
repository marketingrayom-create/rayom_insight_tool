"""Company/EAN-scoped editable reorder inputs; calculations live in the UI."""
import json
import math
import re
import sqlite3
from pathlib import Path
from contextlib import closing
from flask import Blueprint, jsonify, request
from amazon_accounts import organization

planning = Blueprint('reorder_planning', __name__, url_prefix='/api/amazon/reorder-planning')
DB_PATH = Path(__file__).with_name('reorder_planning.sqlite3')
SEED_PATH = Path(__file__).with_name('fixtures') / 'reorder_seed.json'
NUMBER_FIELDS = {'leadTimeDays','ownStock','vcSales45','vcStock','vcInTransit','vcOpenPo',
                 'fbaSales45','fbaStock','fbaInTransit','fbaOpenPo','fbfSales45','fbfStock',
                 'fbfInTransit','fbfOpenPo','safetyBufferDays','safetyStock','incoming','demandDays','override','vcRecallInTransit','fbaRecallInTransit','fbfRecallInTransit'}
TEXT_FIELDS = {'ean','productName','brand','vendorName','recall'}

def connect():
    db = sqlite3.connect(DB_PATH, timeout=10)
    db.execute('CREATE TABLE IF NOT EXISTS plans (company TEXT, ean TEXT, data TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(company,ean))')
    return db

def seed(company):
    brands = {'linso':'linso','rayom':'energizer','shelfesteem':'shelfesteem'}
    return {row['ean']:dict(row,revision=0) for row in json.loads(SEED_PATH.read_text(encoding='utf-8'))
            if row['brand'].casefold()==brands[company]}

@planning.get('')
def get_plans():
    company=organization();rows=seed(company)
    with closing(connect()) as db:
        for ean,data,revision in db.execute('SELECT ean,data,revision FROM plans WHERE company=?',(company,)):
            rows[ean]=dict(json.loads(data),revision=revision)
    return jsonify(success=True,rows=list(rows.values()),organization=company)

@planning.put('/<ean>')
def save_plan(ean):
    company=organization();body=request.get_json(silent=True)
    if not re.fullmatch(r'(?:\d{8}|\d{13})',ean) or not isinstance(body,dict):
        return jsonify(success=False,message='Enter a valid 8 or 13 digit EAN.'),400
    if set(body)-NUMBER_FIELDS-TEXT_FIELDS-{'sources','revision'}:
        return jsonify(success=False,message='Unknown planning field.'),400
    if body.get('ean')!=ean or not isinstance(body.get('productName'),str) or not body['productName'].strip():
        return jsonify(success=False,message='Product name and matching EAN are required.'),400
    if any(value is not None and (isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value))
           for key,value in body.items() if key in NUMBER_FIELDS):
        return jsonify(success=False,message='Quantities must be finite numbers or blank.'),400
    if any(body.get(key) is not None and body[key]<0 for key in NUMBER_FIELDS-{'override'}):
        return jsonify(success=False,message='Stock, sales and settings cannot be negative.'),400
    if body.get('demandDays') is not None and body['demandDays']<=0:
        return jsonify(success=False,message='Demand divisor must be greater than zero.'),400
    if any(value is not None and (not isinstance(value,str) or len(value)>2000) for key,value in body.items() if key in TEXT_FIELDS):
        return jsonify(success=False,message='Invalid text input.'),400
    sources=body.get('sources',{})
    if not isinstance(sources,dict) or any(key not in NUMBER_FIELDS|TEXT_FIELDS or not isinstance(value,str) or len(value)>200 for key,value in sources.items()):
        return jsonify(success=False,message='Invalid input sources.'),400
    revision=body.get('revision',0)
    if isinstance(revision,bool) or not isinstance(revision,int) or revision<0:
        return jsonify(success=False,message='Invalid record revision.'),400
    data={key:body.get(key) for key in NUMBER_FIELDS|TEXT_FIELDS};data['sources']=sources
    db=connect()
    try:
        db.execute('BEGIN IMMEDIATE')
        saved=db.execute('SELECT revision FROM plans WHERE company=? AND ean=?',(company,ean)).fetchone()
        if (saved[0] if saved else 0)!=revision:
            return jsonify(success=False,message='This plan changed elsewhere. Reload plans before saving.'),409
        db.execute('INSERT OR REPLACE INTO plans VALUES (?,?,?,?)',(company,ean,json.dumps(data),revision+1))
        db.commit()
    finally:
        db.close()
    return jsonify(success=True,row=dict(data,revision=revision+1))


@planning.post('/live')
def live_plans():
    from vendor_reorder import live_data
    body=request.get_json(silent=True) or {}
    asins=body.get('asins')
    if not isinstance(asins,list) or len(asins)>100 or any(not isinstance(asin,str) or not re.fullmatch(r'B[A-Z0-9]{9}',asin) for asin in asins):
        return jsonify(success=False,message='Supply up to 100 valid ASINs.'),400
    result=live_data(organization(),list(dict.fromkeys(asins)))
    from seller_reorder import snapshot
    # Match the Vendor report's 45 complete calendar dates for combined totals.
    first=next(iter(result.get('inventory',{}).values()),{})
    if first.get('salesStart') and first.get('salesEnd'):
        seller=snapshot(first['salesStart'],first['salesEnd'])
        for asin,row in result['inventory'].items():
            row.update(seller.get('stock',{}).get(asin,{}))
            row['fbaSales45']=seller['sales'].get(asin,0) if seller['sales'] is not None else None
            row['fbaSource']='Seller Central AFN orders; '+first['salesStart']+' to '+first['salesEnd']
        result['pending']=bool(result.get('pending') or seller['pending'])
        result['message']=' '.join(filter(None,[result.get('message'),seller.get('message'),
            'Seller Central FBA reports loading.' if seller['pending'] else '']))
    return jsonify(result)
