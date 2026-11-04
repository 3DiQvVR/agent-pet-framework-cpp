import { strtod } from '../live2dcubismframework.js';
import { CubismLogInfo } from './cubismdebug.js';
const CSM_JSON_ERROR_TYPE_MISMATCH = 'Error: type mismatch';
const CSM_JSON_ERROR_INDEX_OF_BOUNDS = 'Error: index out of bounds';
export class Value {
    constructor(){}
    getRawString(defaultValue, indent) {
        return this.getString(defaultValue, indent);
    }
    toInt(defaultValue = 0) {
        return defaultValue;
    }
    toFloat(defaultValue = 0) {
        return defaultValue;
    }
    toBoolean(defaultValue = false) {
        return defaultValue;
    }
    getSize() {
        return 0;
    }
    getArray(defaultValue = null) {
        return defaultValue;
    }
    getVector(defaultValue = new Array()) {
        return defaultValue;
    }
    getMap(defaultValue) {
        return defaultValue;
    }
    getValueByIndex(index) {
        return Value.errorValue.setErrorNotForClientCall(CSM_JSON_ERROR_TYPE_MISMATCH);
    }
    getValueByString(s) {
        return Value.nullValue.setErrorNotForClientCall(CSM_JSON_ERROR_TYPE_MISMATCH);
    }
    getKeys() {
        return Value.dummyKeys;
    }
    isError() {
        return false;
    }
    isNull() {
        return false;
    }
    isBool() {
        return false;
    }
    isFloat() {
        return false;
    }
    isString() {
        return false;
    }
    isArray() {
        return false;
    }
    isMap() {
        return false;
    }
    equals(value) {
        return false;
    }
    isStatic() {
        return false;
    }
    setErrorNotForClientCall(errorStr) {
        return JsonError.errorValue;
    }
    static staticInitializeNotForClientCall() {
        JsonBoolean.trueValue = new JsonBoolean(true);
        JsonBoolean.falseValue = new JsonBoolean(false);
        Value.errorValue = new JsonError('ERROR', true);
        Value.nullValue = new JsonNullvalue();
        Value.dummyKeys = new Array();
    }
    static staticReleaseNotForClientCall() {
        JsonBoolean.trueValue = null;
        JsonBoolean.falseValue = null;
        Value.errorValue = null;
        Value.nullValue = null;
        Value.dummyKeys = null;
    }
    _stringBuffer;
    static dummyKeys;
    static errorValue;
    static nullValue;
}
export class CubismJson {
    constructor(buffer, length){
        this._error = null;
        this._lineCount = 0;
        this._root = null;
        if (buffer != undefined) {
            this.parseBytes(buffer, length, this._parseCallback);
        }
    }
    static create(buffer, size) {
        const json = new CubismJson();
        const succeeded = json.parseBytes(buffer, size, json._parseCallback);
        if (!succeeded) {
            CubismJson.delete(json);
            return null;
        } else {
            return json;
        }
    }
    static delete(instance) {
        instance = null;
    }
    getRoot() {
        return this._root;
    }
    static arrayBufferToString(buffer) {
        const uint8Array = new Uint8Array(buffer);
        let str = '';
        for(let i = 0, len = uint8Array.length; i < len; ++i){
            str += '%' + this.pad(uint8Array[i].toString(16));
        }
        str = decodeURIComponent(str);
        return str;
    }
    static pad(n) {
        return n.length < 2 ? '0' + n : n;
    }
    parseBytes(buffer, size, parseCallback) {
        const endPos = new Array(1);
        const decodeBuffer = CubismJson.arrayBufferToString(buffer);
        if (parseCallback == undefined) {
            this._root = this.parseValue(decodeBuffer, size, 0, endPos);
        } else {
            this._root = parseCallback(JSON.parse(decodeBuffer), new JsonMap());
        }
        if (this._error) {
            let strbuf = '\0';
            strbuf = 'Json parse error : @line ' + (this._lineCount + 1) + '\n';
            this._root = new JsonString(strbuf);
            CubismLogInfo('{0}', this._root.getRawString());
            return false;
        } else if (this._root == null) {
            this._root = new JsonError(this._error, false);
            return false;
        }
        return true;
    }
    getParseError() {
        return this._error;
    }
    checkEndOfFile() {
        return this._root.getArray()[1].equals('EOF');
    }
    parseValue(buffer, length, begin, outEndPos) {
        if (this._error) return null;
        let o = null;
        let i = begin;
        let f;
        for(; i < length; i++){
            const c = buffer[i];
            switch(c){
                case '-':
                case '.':
                case '0':
                case '1':
                case '2':
                case '3':
                case '4':
                case '5':
                case '6':
                case '7':
                case '8':
                case '9':
                    {
                        const afterString = new Array(1);
                        f = strtod(buffer.slice(i), afterString);
                        outEndPos[0] = buffer.indexOf(afterString[0]);
                        return new JsonFloat(f);
                    }
                case '"':
                    return new JsonString(this.parseString(buffer, length, i + 1, outEndPos));
                case '[':
                    o = this.parseArray(buffer, length, i + 1, outEndPos);
                    return o;
                case '{':
                    o = this.parseObject(buffer, length, i + 1, outEndPos);
                    return o;
                case 'n':
                    if (i + 3 < length) {
                        o = new JsonNullvalue();
                        outEndPos[0] = i + 4;
                    } else {
                        this._error = 'parse null';
                    }
                    return o;
                case 't':
                    if (i + 3 < length) {
                        o = JsonBoolean.trueValue;
                        outEndPos[0] = i + 4;
                    } else {
                        this._error = 'parse true';
                    }
                    return o;
                case 'f':
                    if (i + 4 < length) {
                        o = JsonBoolean.falseValue;
                        outEndPos[0] = i + 5;
                    } else {
                        this._error = "illegal ',' position";
                    }
                    return o;
                case ',':
                    this._error = "illegal ',' position";
                    return null;
                case ']':
                    outEndPos[0] = i;
                    return null;
                case '\n':
                    this._lineCount++;
                case ' ':
                case '\t':
                case '\r':
                default:
                    break;
            }
        }
        this._error = 'illegal end of value';
        return null;
    }
    parseString(string, length, begin, outEndPos) {
        if (this._error) {
            return null;
        }
        if (!string) {
            this._error = 'string is null';
            return null;
        }
        let i = begin;
        let c, c2;
        let ret = '';
        let bufStart = begin;
        for(; i < length; i++){
            c = string[i];
            switch(c){
                case '"':
                    {
                        outEndPos[0] = i + 1;
                        ret += string.substr(bufStart, i - bufStart);
                        return ret;
                    }
                case '//':
                    {
                        i++;
                        if (i - 1 > bufStart) {
                            ret += string.substr(bufStart, i - bufStart);
                        }
                        bufStart = i + 1;
                        if (i < length) {
                            c2 = string[i];
                            switch(c2){
                                case '\\':
                                    ret += '\\';
                                    break;
                                case '"':
                                    ret += '"';
                                    break;
                                case '/':
                                    ret += '/';
                                    break;
                                case 'b':
                                    ret += '\b';
                                    break;
                                case 'f':
                                    ret += '\f';
                                    break;
                                case 'n':
                                    ret += '\n';
                                    break;
                                case 'r':
                                    ret += '\r';
                                    break;
                                case 't':
                                    ret += '\t';
                                    break;
                                case 'u':
                                    this._error = 'parse string/unicord escape not supported';
                                    break;
                                default:
                                    break;
                            }
                        } else {
                            this._error = 'parse string/escape error';
                        }
                    }
                default:
                    {
                        break;
                    }
            }
        }
        this._error = 'parse string/illegal end';
        return null;
    }
    parseObject(buffer, length, begin, outEndPos) {
        if (this._error) {
            return null;
        }
        if (!buffer) {
            this._error = 'buffer is null';
            return null;
        }
        const ret = new JsonMap();
        let key = '';
        let i = begin;
        let c = '';
        const localRetEndPos2 = Array(1);
        let ok = false;
        for(; i < length; i++){
            FOR_LOOP: for(; i < length; i++){
                c = buffer[i];
                switch(c){
                    case '"':
                        key = this.parseString(buffer, length, i + 1, localRetEndPos2);
                        if (this._error) {
                            return null;
                        }
                        i = localRetEndPos2[0];
                        ok = true;
                        break FOR_LOOP;
                    case '}':
                        outEndPos[0] = i + 1;
                        return ret;
                    case ':':
                        this._error = "illegal ':' position";
                        break;
                    case '\n':
                        this._lineCount++;
                    default:
                        break;
                }
            }
            if (!ok) {
                this._error = 'key not found';
                return null;
            }
            ok = false;
            FOR_LOOP2: for(; i < length; i++){
                c = buffer[i];
                switch(c){
                    case ':':
                        ok = true;
                        i++;
                        break FOR_LOOP2;
                    case '}':
                        this._error = "illegal '}' position";
                        break;
                    case '\n':
                        this._lineCount++;
                    default:
                        break;
                }
            }
            if (!ok) {
                this._error = "':' not found";
                return null;
            }
            const value = this.parseValue(buffer, length, i, localRetEndPos2);
            if (this._error) {
                return null;
            }
            i = localRetEndPos2[0];
            ret.put(key, value);
            FOR_LOOP3: for(; i < length; i++){
                c = buffer[i];
                switch(c){
                    case ',':
                        break FOR_LOOP3;
                    case '}':
                        outEndPos[0] = i + 1;
                        return ret;
                    case '\n':
                        this._lineCount++;
                    default:
                        break;
                }
            }
        }
        this._error = 'illegal end of perseObject';
        return null;
    }
    parseArray(buffer, length, begin, outEndPos) {
        if (this._error) {
            return null;
        }
        if (!buffer) {
            this._error = 'buffer is null';
            return null;
        }
        let ret = new JsonArray();
        let i = begin;
        let c;
        const localRetEndpos2 = new Array(1);
        for(; i < length; i++){
            const value = this.parseValue(buffer, length, i, localRetEndpos2);
            if (this._error) {
                return null;
            }
            i = localRetEndpos2[0];
            if (value) {
                ret.add(value);
            }
            FOR_LOOP: for(; i < length; i++){
                c = buffer[i];
                switch(c){
                    case ',':
                        break FOR_LOOP;
                    case ']':
                        outEndPos[0] = i + 1;
                        return ret;
                    case '\n':
                        ++this._lineCount;
                    default:
                        break;
                }
            }
        }
        ret = void 0;
        this._error = 'illegal end of parseObject';
        return null;
    }
    _parseCallback = CubismJsonExtension.parseJsonObject;
    _error;
    _lineCount;
    _root;
}
export class JsonFloat extends Value {
    constructor(v){
        super();
        this._value = v;
    }
    isFloat() {
        return true;
    }
    getString(defaultValue, indent) {
        const strbuf = '\0';
        this._value = parseFloat(strbuf);
        this._stringBuffer = strbuf;
        return this._stringBuffer;
    }
    toInt(defaultValue = 0) {
        return parseInt(this._value.toString());
    }
    toFloat(defaultValue = 0.0) {
        return this._value;
    }
    equals(value) {
        if ('number' === typeof value) {
            if (Math.round(value)) {
                return false;
            } else {
                return value == this._value;
            }
        }
        return false;
    }
    _value;
}
export class JsonBoolean extends Value {
    isBool() {
        return true;
    }
    toBoolean(defaultValue = false) {
        return this._boolValue;
    }
    getString(defaultValue, indent) {
        this._stringBuffer = this._boolValue ? 'true' : 'false';
        return this._stringBuffer;
    }
    equals(value) {
        if ('boolean' === typeof value) {
            return value == this._boolValue;
        }
        return false;
    }
    isStatic() {
        return true;
    }
    constructor(v){
        super();
        this._boolValue = v;
    }
    static trueValue;
    static falseValue;
    _boolValue;
}
export class JsonString extends Value {
    constructor(s){
        super();
        this._stringBuffer = s;
    }
    isString() {
        return true;
    }
    getString(defaultValue, indent) {
        return this._stringBuffer;
    }
    equals(value) {
        if ('string' === typeof value) {
            return this._stringBuffer == value;
        }
        return false;
    }
}
export class JsonError extends JsonString {
    isStatic() {
        return this._isStatic;
    }
    setErrorNotForClientCall(s) {
        this._stringBuffer = s;
        return this;
    }
    constructor(s, isStatic){
        if ('string' === typeof s) {
            super(s);
        } else {
            super(s);
        }
        this._isStatic = isStatic;
    }
    isError() {
        return true;
    }
    _isStatic;
}
export class JsonNullvalue extends Value {
    isNull() {
        return true;
    }
    getString(defaultValue, indent) {
        return this._stringBuffer;
    }
    isStatic() {
        return true;
    }
    setErrorNotForClientCall(s) {
        this._stringBuffer = s;
        return JsonError.nullValue;
    }
    constructor(){
        super();
        this._stringBuffer = 'NullValue';
    }
}
export class JsonArray extends Value {
    constructor(){
        super();
        this._array = new Array();
    }
    release() {
        for(let i = 0; i < this._array.length; i++){
            let v = this._array[i];
            if (v && !v.isStatic()) {
                v = void 0;
                v = null;
            }
        }
    }
    isArray() {
        return true;
    }
    getValueByIndex(index) {
        if (index < 0 || this._array.length <= index) {
            return Value.errorValue.setErrorNotForClientCall(CSM_JSON_ERROR_INDEX_OF_BOUNDS);
        }
        const v = this._array[index];
        if (v == null) {
            return Value.nullValue;
        }
        return v;
    }
    getValueByString(s) {
        return Value.errorValue.setErrorNotForClientCall(CSM_JSON_ERROR_TYPE_MISMATCH);
    }
    getString(defaultValue, indent) {
        const stringBuffer = indent + '[\n';
        for(let i = 0; i < this._array.length; i++){
            const v = this._array[i];
            this._stringBuffer += indent + '' + v.getString(indent + ' ') + '\n';
        }
        this._stringBuffer = stringBuffer + indent + ']\n';
        return this._stringBuffer;
    }
    add(v) {
        this._array.push(v);
    }
    getVector(defaultValue = null) {
        return this._array;
    }
    getSize() {
        return this._array.length;
    }
    _array;
}
export class JsonMap extends Value {
    constructor(){
        super();
        this._map = new Map();
    }
    release() {
        this._map.clear();
    }
    isMap() {
        return true;
    }
    getValueByString(s) {
        const ret = this._map.get(s);
        if (ret != undefined) {
            return ret;
        }
        return Value.nullValue;
    }
    getValueByIndex(index) {
        return Value.errorValue.setErrorNotForClientCall(CSM_JSON_ERROR_TYPE_MISMATCH);
    }
    getString(defaultValue, indent) {
        this._stringBuffer = indent + '{\n';
        for (const element of this._map){
            const key = element[0];
            const v = element[1];
            this._stringBuffer += indent + ' ' + key + ' : ' + v.getString(indent + '   ') + ' \n';
        }
        this._stringBuffer += indent + '}\n';
        return this._stringBuffer;
    }
    getMap(defaultValue) {
        return this._map;
    }
    put(key, v) {
        this._map.set(key, v);
    }
    getKeys() {
        if (!this._keys) {
            this._keys = [
                ...this._map.keys()
            ];
        }
        return this._keys;
    }
    getSize() {
        return this._keys.length;
    }
    _map;
    _keys;
}
import * as $ from './cubismjson.js';
import { CubismJsonExtension } from './cubismjsonextension.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismJson = $.CubismJson;
    Live2DCubismFramework.JsonArray = $.JsonArray;
    Live2DCubismFramework.JsonBoolean = $.JsonBoolean;
    Live2DCubismFramework.JsonError = $.JsonError;
    Live2DCubismFramework.JsonFloat = $.JsonFloat;
    Live2DCubismFramework.JsonMap = $.JsonMap;
    Live2DCubismFramework.JsonNullvalue = $.JsonNullvalue;
    Live2DCubismFramework.JsonString = $.JsonString;
    Live2DCubismFramework.Value = $.Value;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
