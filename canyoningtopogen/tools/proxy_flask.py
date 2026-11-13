import os
import re
import json
import http.client
import urllib.request
import urllib.error
from flask import Flask, request, Response, send_from_directory

PORT = int(os.environ.get('PORT', 5000))
HOST = os.environ.get('HOST', '0.0.0.0')
AI_KEY = os.environ.get('AI_KEY', '')
AI_UPSTREAM = (
    os.environ.get('AI_UPSTREAM')
    or 'https://api.swisscom.com/products/swiss-ai-platform/internal-all-models/v1'
).rstrip('/')
AI_MODEL = os.environ.get('AI_MODEL', 'qwen/qwen3.6-35b-a3b')
AI_AUTH_HEADER = os.environ.get('AI_AUTH_HEADER', 'Authorization')
AI_AUTH_SCHEME = os.environ.get('AI_AUTH_SCHEME', 'Bearer ')
AI_API = os.environ.get('AI_API', 'openai').lower()
ALLOWED_ORIGIN = os.environ.get('ALLOWED_ORIGIN', '*')
MAX_PROMPT_CHARS = int(os.environ.get('MAX_PROMPT_CHARS', '32000'))
MAX_TOKENS = int(os.environ.get('MAX_TOKENS', '8000'))

TEMPERATURE = 0.15
NO_THINKING_KWARGS = {'enable_thinking': False}

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), os.pardir))

app = Flask(
    __name__,
    static_folder=REPO_ROOT,
    static_url_path='',
    template_folder=REPO_ROOT,
)

def cors_headers():
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
    }

def json_response(payload, status, extra_headers=None):
    body_str = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    resp = Response(body_str, status=status, mimetype='application/json; charset=utf-8')
    for k, v in cors_headers().items():
        resp.headers[k] = v
    if extra_headers:
        for k, v in extra_headers.items():
            resp.headers[k] = v
    return resp

def split_data_url(image):
    m = re.match(r'^data:([^;,]+);base64,(.*)$', image or '')
    if not m:
        raise ValueError('image muss eine base64-Data-URL sein.')
    return m.group(1), m.group(2)

def rejects_thinking_switch(status, text):
    if status not in (400, 422):
        return False
    text = text or ''
    if 'chat_template_kwargs' in text:
        return True
    if re.search(r'additional\s*propert', text, re.I):
        return True
    return False

def rejects_json_mode(status, text):
    if status not in (400, 404, 422, 500):
        return False
    return bool(re.search(r'response_format|json_object|json.mode|json_schema', text or '', re.I))

def extract_text(data):
    if isinstance(data, str):
        return data
    choices = data.get('choices', [])
    if not choices:
        return ''
    msg = choices[0].get('message', {})
    content = msg.get('content', '')
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return ''.join(p.get('text', '') for p in content if isinstance(p, dict))
    return ''

def empty_answer_message(data):
    choices = data.get('choices', [])
    choice = choices[0] if choices else {}
    finish = choice.get('finish_reason') or choice.get('stop_reason') or data.get('stop_reason')
    msg = choice.get('message', {})
    reasoning = msg.get('reasoning') or msg.get('reasoning_content')
    if finish == 'length' or reasoning:
        return 'Das Modell hat sein Token-Budget komplett zum Nachdenken verbraucht (finish_reason=' + str(finish or 'unbekannt') + ') - anderes Modell waehlen oder Denkmodus abschalten.'
    return 'Upstream-Antwort enthielt keinen Text.'

def extract_models(data):
    if isinstance(data, list):
        lst = data
    else:
        lst = data.get('data') or data.get('models') or []
    ids = []
    for entry in lst:
        if isinstance(entry, str):
            ids.append(entry)
        elif isinstance(entry, dict):
            ids.append(entry.get('id') or entry.get('name') or '')
    ids = [i.strip() for i in ids if i.strip()]
    return sorted(set(ids))

def _http_request(url, headers_dict, method='GET', data=None):
    parsed = urllib.request.urlparse(url)
    host = parsed.hostname or 'localhost'
    port = parsed.port
    use_ssl = parsed.scheme == 'https'
    if use_ssl:
        port = port or 443
        conn = http.client.HTTPSConnection(host, port, timeout=60)
    else:
        port = port or 80
        conn = http.client.HTTPConnection(host, port, timeout=60)
    try:
        conn.request(method, parsed.path + ('?' + parsed.query if parsed.query else ''), body=data, headers=headers_dict)
        resp = conn.getresponse()
        raw = resp.read().decode('utf-8')
        status = resp.status
        return status, raw
    finally:
        conn.close()

def do_upstream_post(url, headers_dict, body_json):
    data = json.dumps(body_json).encode('utf-8')
    headers_dict['Content-Length'] = str(len(data))
    return _http_request(url, headers_dict, method='POST', data=data)

@app.route('/')
@app.route('/index.html')
def index():
    return send_from_directory(REPO_ROOT, 'index.html')

@app.route('/<path:filename>')
def static_file(filename):
    mime_map = {
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.xml': 'application/xml; charset=utf-8',
        '.xsd': 'application/xml; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.pdf': 'application/pdf',
    }
    ext = os.path.splitext(filename)[1].lower()
    mime = mime_map.get(ext, 'application/octet-stream')
    return send_from_directory(REPO_ROOT, filename, mimetype=mime)

@app.route('/api/health', methods=['GET'])
def health():
    data = {
        'ok': True,
        'api': AI_API,
        'upstream': AI_UPSTREAM,
        'model': AI_MODEL,
        'authHeader': AI_AUTH_HEADER,
        'keyConfigured': bool(AI_KEY),
        'acceptsClientConfig': True,
        'canListModels': True,
        'acceptsSystemPrompt': True,
        'maxPromptChars': MAX_PROMPT_CHARS,
    }
    return json_response(data, 200)

@app.route('/api/models', methods=['POST', 'OPTIONS'])
def models():
    if request.method == 'OPTIONS':
        resp = Response('', status=204)
        for k, v in cors_headers().items():
            resp.headers[k] = v
        return resp
    if request.method != 'POST':
        return json_response({'error': 'Nur POST.'}, 405)

    body = request.get_json(silent=True) or {}
    base = (body.get('endpoint', '') or AI_UPSTREAM).rstrip('/')
    key = body.get('apiKey', AI_KEY)
    auth_header = body.get('authHeader', AI_AUTH_HEADER)
    auth_scheme = body.get('authScheme', AI_AUTH_SCHEME)
    api = (body.get('api', AI_API)).lower()

    if not key:
        return json_response({'error': 'Kein API-Key vorhanden.'}, 400)
    if not base:
        return json_response({'error': 'Kein Endpoint konfiguriert.'}, 400)

    auth_value = auth_scheme + key
    if any(ord(c) > 255 for c in auth_value):
        return json_response({'error': 'Der API-Key enthaelt ein ungueltiges Zeichen.'}, 400)

    req_headers = {
        'Content-Type': 'application/json',
        auth_header: auth_value,
    }
    if api == 'anthropic':
        req_headers['anthropic-version'] = '2023-06-01'

    url = base + '/models'
    try:
        status, raw = _http_request(url, req_headers)
    except Exception as exc:
        return json_response({'error': str(exc)}, 502)

    if status != 200:
        detail = raw[:300]
        try:
            detail = json.loads(raw).get('error', {}).get('message', detail)
        except Exception:
            pass
        hint = 'Dieser Endpoint kennt keine Modell-Liste.' if status == 404 else None
        return json_response({'error': 'Upstream-Fehler ' + str(status) + ': ' + detail, 'hint': hint}, status)

    try:
        data = json.loads(raw)
    except Exception:
        return json_response({'error': 'Upstream hat kein JSON geliefert.'}, 502)

    models_list = extract_models(data)
    if not models_list:
        return json_response({'error': 'Upstream lieferte keine erkennbare Modell-Liste.'}, 502)
    return json_response({'models': models_list}, 200)

@app.route('/api/topo', methods=['POST', 'OPTIONS'])
def topo():
    if request.method == 'OPTIONS':
        resp = Response('', status=204)
        for k, v in cors_headers().items():
            resp.headers[k] = v
        return resp
    if request.method != 'POST':
        return json_response({'error': 'Nur POST.'}, 405)

    body = request.get_json(silent=True) or {}
    image = body.get('image')
    prompt = body.get('prompt')

    if not image or not prompt:
        return json_response({'error': 'image und prompt sind erforderlich.'}, 400)
    if not isinstance(prompt, str):
        return json_response({'error': 'prompt muss Text sein.'}, 400)

    system = body.get('system', '')
    if system and not isinstance(system, str):
        return json_response({'error': 'system muss Text sein.'}, 400)
    if len(prompt) > MAX_PROMPT_CHARS or len(str(system)) > MAX_PROMPT_CHARS:
        return json_response({'error': 'Prompt zu lang - erlaubt sind ' + str(MAX_PROMPT_CHARS) + ' Zeichen je Teil.'}, 400)

    cfg_base = (body.get('endpoint', '') or AI_UPSTREAM).rstrip('/')
    cfg_api = (body.get('api', AI_API)).lower()
    cfg_model = body.get('model', AI_MODEL)
    cfg_key = body.get('apiKey', AI_KEY)
    cfg_auth_header = body.get('authHeader', AI_AUTH_HEADER)
    cfg_auth_scheme = body.get('authScheme', AI_AUTH_SCHEME)

    if not cfg_key:
        return json_response({'error': 'Kein API-Key vorhanden. In der App eintragen oder Proxy mit AI_KEY=... starten.'}, 500)
    if not cfg_base:
        return json_response({'error': 'Kein Endpoint konfiguriert.'}, 400)

    try:
        media_type, b64 = split_data_url(image)
    except ValueError as exc:
        return json_response({'error': str(exc)}, 400)

    for attempt in range(3):
        if attempt == 0:
            json_mode = True
            no_thinking = True
        elif attempt == 1:
            json_mode = True
            no_thinking = False
        else:
            json_mode = False
            no_thinking = False

        if cfg_api == 'anthropic':
            url = cfg_base + '/messages'
            msg_body = {
                'model': cfg_model,
                'max_tokens': MAX_TOKENS,
                'temperature': TEMPERATURE,
            }
            if system:
                msg_body['system'] = system
            msg_body['messages'] = [{
                'role': 'user',
                'content': [
                    {'type': 'image', 'source': {'type': 'base64', 'media_type': media_type, 'data': b64}},
                    {'type': 'text', 'text': prompt},
                ],
            }]
        else:
            url = cfg_base + '/chat/completions'
            messages = []
            if system:
                messages.append({'role': 'system', 'content': system})
            messages.append({
                'role': 'user',
                'content': [
                    {'type': 'image_url', 'image_url': {'url': image}},
                    {'type': 'text', 'text': prompt},
                ],
            })
            msg_body = {
                'model': cfg_model,
                'max_tokens': MAX_TOKENS,
                'temperature': TEMPERATURE,
                'messages': messages,
            }
            if json_mode:
                msg_body['response_format'] = {'type': 'json_object'}
            if no_thinking:
                msg_body['chat_template_kwargs'] = dict(NO_THINKING_KWARGS)

        auth_value = cfg_auth_scheme + cfg_key
        if any(ord(c) > 255 for c in auth_value):
            return json_response({'error': 'Der API-Key enthaelt ein ungueltiges Zeichen.'}, 400)

        req_headers = {
            'Content-Type': 'application/json',
            cfg_auth_header: auth_value,
        }
        if cfg_api == 'anthropic':
            req_headers['anthropic-version'] = '2023-06-01'

        try:
            status, raw = do_upstream_post(url, req_headers, msg_body)
        except Exception as exc:
            return json_response({'error': 'Upstream nicht erreichbar: ' + str(exc)}, 502)

        if status == 200:
            break

        if not rejects_thinking_switch(status, raw) and not rejects_json_mode(status, raw):
            break
        # Will retry on next iteration

    if status != 200:
        detail = raw[:400]
        try:
            detail = json.loads(raw).get('error', {}).get('message', detail)
        except Exception:
            pass
        return json_response({'error': 'Upstream-Fehler ' + str(status) + ': ' + detail}, status)

    try:
        data = json.loads(raw)
    except Exception:
        return json_response({'error': 'Upstream hat kein JSON geliefert.'}, 502)

    text = extract_text(data)
    if not text.strip():
        return json_response({'error': empty_answer_message(data)}, 502)

    return json_response(text, 200)

if __name__ == '__main__':
    print('Canyon-Topo-Proxy startet auf http://' + HOST + ':' + str(PORT))
    print('AI_KEY gesetzt: ' + ('ja' if AI_KEY else 'nein'))
    app.run(host=HOST, port=PORT, debug=False)
