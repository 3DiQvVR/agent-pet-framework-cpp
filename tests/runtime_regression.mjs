// Windows integration checks against an isolated PetCore process and local LLM stub.
// Usage: node tests/runtime_regression.mjs build/live2d-bin/petcore.exe
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import vm from 'node:vm';

const repo = process.cwd();
const executable = path.resolve(process.argv[2] || 'build/petcore.exe');
const testRoot = path.resolve(repo, '_petcore_test_tmp');
fs.mkdirSync(testRoot, {recursive: true});
const dir = fs.mkdtempSync(path.join(testRoot, 'runtime_'));
const env = {...process.env};
for (const name of Object.keys(env)) if (name.startsWith('PETCORE_')) delete env[name];
const processes = new Set();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function launch(args) {
    const proc = spawn(executable, args, {cwd: dir, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    processes.add(proc);
    proc.output = '';
    proc.stdout.on('data', chunk => { proc.output += chunk.toString('utf8'); });
    proc.stderr.on('data', chunk => { proc.output += chunk.toString('utf8'); });
    proc.on('error', error => { proc.launchError = error; });
    proc.on('exit', () => processes.delete(proc));
    return proc;
}
async function stop(proc) {
    if (proc.exitCode !== null || proc.signalCode !== null) return;
    const exited = once(proc, 'exit'); proc.kill(); await exited;
}
async function request(port, method, target, body) {
    const payload = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
    return new Promise((resolve, reject) => {
        const req = http.request({host: '127.0.0.1', port, method, path: target, agent: false,
            headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload)}}, res => {
            let text = ''; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; });
            res.on('end', () => resolve({status: res.statusCode, text}));
            res.on('error', reject);
        });
        req.setTimeout(10000, () => req.destroy(new Error('HTTP test timeout')));
        req.on('error', reject); req.end(payload);
    });
}
async function server(config, name) {
    const configPath = path.join(dir, `${name}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config));
    const proc = launch(['ui', '--config', configPath, '--no-open']);
    for (let i = 0; i < 100; ++i) {
        if (proc.launchError) throw proc.launchError;
        const match = proc.output.match(/PetCore UI: http:\/\/127\.0\.0\.1:(\d+)/);
        if (match) return {proc, port: Number(match[1]), configPath};
        if (proc.exitCode !== null) throw new Error(`server exited: ${proc.output}`);
        await delay(50);
    }
    throw new Error(`server startup timeout: ${proc.output}`);
}
function parseDone(text) {
    const events = text.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6)));
    return events.findLast(event => event.type === 'done')?.data;
}
const config = {llm: {provider: 'mock'}, database: {adapter: 'json', path: 'db.json'},
    agent: {auto_summarize: false}, characters: {dirs: [path.join(repo, 'cards')], user_dir: 'characters'},
    ui: {host: '127.0.0.1', port: 0, open_browser: false}};
let stub;
try {
    fs.mkdirSync(path.join(dir, 'web'));
    fs.writeFileSync(path.join(dir, 'web/index.html'), 'STATIC_OK');
    fs.writeFileSync(path.join(dir, 'outside.txt'), 'OUTSIDE_SENTINEL');
    const app = await server(config, 'ui');
    assert.equal((await request(app.port, 'GET', '/')).text, 'STATIC_OK');
    const rooted = path.join(dir, 'outside.txt').replaceAll('\\', '/').replace(/^[A-Za-z]:/, '');
    for (const target of ['/' + rooted, '/%2f' + rooted.slice(1), '/..%2foutside.txt', '/%5coutside.txt'])
        assert.equal((await request(app.port, 'GET', target)).status, 400, target);
    const card = JSON.parse(fs.readFileSync(path.join(repo, 'cards/reimu.json'), 'utf8'));
    const sessions = {};
    for (const scope of ['character', 'session']) {
        const id = `test_${scope}`;
        const custom = structuredClone(card); custom.id = id; custom.memory.scope = scope;
        assert.equal((await request(app.port, 'POST', '/api/characters', custom)).status, 200);
        const created = JSON.parse((await request(app.port, 'POST', '/api/sessions', {character_id: id})).text);
        sessions[scope] = created.session.id;
        const chat = await request(app.port, 'POST', '/api/chat', {session_id: created.session.id, message: `记住 audit_key 是 ${scope}_value`});
        assert.equal(parseDone(chat.text)?.stop_reason, 'completed');
        const facts = JSON.parse((await request(app.port, 'GET', `/api/memory?session_id=${created.session.id}`)).text).facts;
        assert(facts.some(fact => fact.value === `${scope}_value`));
        const second = JSON.parse((await request(app.port, 'POST', '/api/sessions', {character_id: id})).text);
        const secondFacts = JSON.parse((await request(app.port, 'GET', `/api/memory?session_id=${second.session.id}`)).text).facts;
        assert.equal(secondFacts.some(fact => fact.value === `${scope}_value`), scope === 'character');
    }
    assert.equal((await request(app.port, 'GET', '/api/memory?session_id=missing')).status, 404);
    for (const relative of [rooted, '\\outside.txt', '../outside.txt', 'C:outside.txt']) {
        assert.equal((await request(app.port, 'PUT', '/api/live2d/test_character/' + encodeURIComponent(relative), 'BAD')).status, 400);
    }
    assert.equal(fs.readFileSync(path.join(dir, 'outside.txt'), 'utf8'), 'OUTSIDE_SENTINEL');
    assert.equal((await request(app.port, 'PUT', '/api/live2d/test_character/textures/ok.txt', 'ASSET_OK')).status, 200);
    assert.equal((await request(app.port, 'GET', '/live2d/test_character/textures/ok.txt')).text, 'ASSET_OK');
    // Windows junctions need no symbolic-link privilege. Validate canonical
    // containment through a real reparse point, using only our temporary files.
    fs.symlinkSync(dir, path.join(dir, 'web/junction'), 'junction');
    assert.equal((await request(app.port, 'GET', '/junction/outside.txt')).status, 400);
    fs.symlinkSync(dir, path.join(dir, 'data/live2d/test_character/junction'), 'junction');
    assert.equal((await request(app.port, 'PUT', '/api/live2d/test_character/junction/escape.txt', 'BAD')).status, 400);
    assert(!fs.existsSync(path.join(dir, 'escape.txt')));
    console.log('[PASS] HTTP confinement, valid assets, and both memory scopes');
    await stop(app.proc);

    for (const scope of ['character', 'session']) {
        const cli = launch(['chat', '--config', app.configPath, '--card', `test_${scope}`]);
        const exited = once(cli, 'exit');
        cli.stdin.end(scope === 'character' ? '/memory\n/quit\n' : '记住 cli_key 是 cli_value\n/memory\n/quit\n');
        const timer = setTimeout(() => cli.kill(), 10000);
        await exited; clearTimeout(timer);
        assert.equal(cli.exitCode, 0, cli.output);
        assert(cli.output.includes(scope === 'character' ? '- audit_key：character_value' : '- cli_key：cli_value'), cli.output);
    }
    console.log('[PASS] CLI memory display in character and session scope');

    const source = fs.readFileSync(path.join(repo, 'web/app.js'), 'utf8');
    const loadMemory = source.slice(source.indexOf('  async function loadMemory()'), source.indexOf('  async function readSSE'));
    let queried, rendered;
    const context = {state: {card: {id: 'x'}, session: {id: 'session-test'}},
        api: async target => { queried = target; return {facts: ['scope-result']}; },
        renderMemory: facts => { rendered = facts; }, el: {memory: {innerHTML: ''}}};
    vm.createContext(context); vm.runInContext(loadMemory, context); await context.loadMemory();
    assert.equal(queried, '/api/memory?session_id=session-test'); assert.equal(rendered[0], 'scope-result');
    rendered = undefined;
    context.api = async () => { context.state.session = {id: 'switched'}; return {facts: ['stale']}; };
    await context.loadMemory(); assert.equal(rendered, undefined);
    console.log('[PASS] Web memory request uses active session');

    const eventHandler = source.slice(source.indexOf('  function handleEvent(event)'), source.indexOf('  async function send(text)'));
    const partial = {textContent: 'PARTIAL_TEXT'};
    const displayed = [];
    const eventContext = {state: {streamText: partial, card: {}},
        finishPendingStream: () => { eventContext.state.streamText = null; },
        addMessage: (role, text) => displayed.push(text), showBubble: () => {}};
    vm.createContext(eventContext); vm.runInContext(eventHandler, eventContext);
    eventContext.handleEvent({type: 'done', data: {stop_reason: 'llm_error', text: 'Connection failed'}});
    assert(partial.textContent.includes('回复未完成'));
    assert.deepEqual(displayed, ['Connection failed']);
    eventContext.handleEvent({type: 'done', data: {stop_reason: 'completed', text: 'Duplicate'}});
    assert.equal(displayed.length, 1);
    console.log('[PASS] Web marks interrupted answers without duplicating successful ones');

    let mode = 'complete';
    const delta = 'data: {"choices":[{"delta":{"content":"PARTIAL_TEXT"}}]}\n\n';
    stub = http.createServer((req, res) => {
        req.resume();
        req.on('end', () => {
            res.setHeader('Content-Type', 'text/event-stream');
            if (mode === 'short-body') {
                res.setHeader('Content-Length', Buffer.byteLength(delta) + 500);
                res.end(delta);
            } else if (mode === 'unfinished') res.end(delta);
            else res.end(delta + 'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
        });
    });
    stub.listen(0, '127.0.0.1'); await once(stub, 'listening');
    const networkConfig = structuredClone(config);
    networkConfig.database.path = 'network-db.json';
    networkConfig.llm = {provider: 'openai', base_url: `http://127.0.0.1:${stub.address().port}/v1`, model: 'test', timeout: 2};
    const network = await server(networkConfig, 'network');
    for (const scenario of ['complete', 'unfinished', 'short-body']) {
        mode = scenario;
        const created = JSON.parse((await request(network.port, 'POST', '/api/sessions', {character_id: 'reimu'})).text);
        const response = await request(network.port, 'POST', '/api/chat', {session_id: created.session.id, message: 'hello'});
        const done = parseDone(response.text);
        assert.equal(done?.stop_reason, scenario === 'complete' ? 'completed' : 'llm_error', response.text);
        if (scenario !== 'complete') assert.notEqual(done.text, 'PARTIAL_TEXT');
    }
    console.log('[PASS] WinHTTP complete, truncated SSE, and interrupted transport');
    await stop(network.proc);
} finally {
    for (const proc of [...processes]) await stop(proc);
    if (stub) { stub.closeAllConnections(); await new Promise(resolve => stub.close(resolve)); }
    const resolved = path.resolve(dir);
    if (!resolved.startsWith(testRoot + path.sep)) throw new Error('Refusing cleanup outside test root');
    fs.rmSync(resolved, {recursive: true, force: true});
}
