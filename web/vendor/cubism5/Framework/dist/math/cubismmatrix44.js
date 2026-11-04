import { CubismMath } from './cubismmath.js';
export class CubismMatrix44 {
    constructor(){
        this._tr = new Float32Array(16);
        this.loadIdentity();
    }
    static multiply(a, b, dst) {
        const c = new Float32Array([
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0,
            0.0
        ]);
        const n = 4;
        for(let i = 0; i < n; ++i){
            for(let j = 0; j < n; ++j){
                for(let k = 0; k < n; ++k){
                    c[j + i * 4] += a[k + i * 4] * b[j + k * 4];
                }
            }
        }
        for(let i = 0; i < 16; ++i){
            dst[i] = c[i];
        }
    }
    loadIdentity() {
        const c = new Float32Array([
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0
        ]);
        this.setMatrix(c);
    }
    setMatrix(tr) {
        for(let i = 0; i < 16; ++i){
            this._tr[i] = tr[i];
        }
    }
    getArray() {
        return this._tr;
    }
    getScaleX() {
        return this._tr[0];
    }
    getScaleY() {
        return this._tr[5];
    }
    getTranslateX() {
        return this._tr[12];
    }
    getTranslateY() {
        return this._tr[13];
    }
    transformX(src) {
        return this._tr[0] * src + this._tr[12];
    }
    transformY(src) {
        return this._tr[5] * src + this._tr[13];
    }
    invertTransformX(src) {
        return (src - this._tr[12]) / this._tr[0];
    }
    invertTransformY(src) {
        return (src - this._tr[13]) / this._tr[5];
    }
    translateRelative(x, y) {
        const tr1 = new Float32Array([
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            x,
            y,
            0.0,
            1.0
        ]);
        CubismMatrix44.multiply(tr1, this._tr, this._tr);
    }
    translate(x, y) {
        this._tr[12] = x;
        this._tr[13] = y;
    }
    translateX(x) {
        this._tr[12] = x;
    }
    translateY(y) {
        this._tr[13] = y;
    }
    scaleRelative(x, y) {
        const tr1 = new Float32Array([
            x,
            0.0,
            0.0,
            0.0,
            0.0,
            y,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0,
            0.0,
            0.0,
            0.0,
            0.0,
            1.0
        ]);
        CubismMatrix44.multiply(tr1, this._tr, this._tr);
    }
    scale(x, y) {
        this._tr[0] = x;
        this._tr[5] = y;
    }
    multiplyByMatrix(m) {
        CubismMatrix44.multiply(m.getArray(), this._tr, this._tr);
    }
    getInvert() {
        const r00 = this._tr[0];
        const r10 = this._tr[1];
        const r20 = this._tr[2];
        const r01 = this._tr[4];
        const r11 = this._tr[5];
        const r21 = this._tr[6];
        const r02 = this._tr[8];
        const r12 = this._tr[9];
        const r22 = this._tr[10];
        const tx = this._tr[12];
        const ty = this._tr[13];
        const tz = this._tr[14];
        const det = r00 * (r11 * r22 - r12 * r21) - r01 * (r10 * r22 - r12 * r20) + r02 * (r10 * r21 - r11 * r20);
        const dst = new CubismMatrix44();
        if (CubismMath.abs(det) < CubismMath.Epsilon) {
            dst.loadIdentity();
            return dst;
        }
        const invDet = 1.0 / det;
        const inv00 = (r11 * r22 - r12 * r21) * invDet;
        const inv01 = -(r01 * r22 - r02 * r21) * invDet;
        const inv02 = (r01 * r12 - r02 * r11) * invDet;
        const inv10 = -(r10 * r22 - r12 * r20) * invDet;
        const inv11 = (r00 * r22 - r02 * r20) * invDet;
        const inv12 = -(r00 * r12 - r02 * r10) * invDet;
        const inv20 = (r10 * r21 - r11 * r20) * invDet;
        const inv21 = -(r00 * r21 - r01 * r20) * invDet;
        const inv22 = (r00 * r11 - r01 * r10) * invDet;
        dst._tr[0] = inv00;
        dst._tr[1] = inv10;
        dst._tr[2] = inv20;
        dst._tr[3] = 0.0;
        dst._tr[4] = inv01;
        dst._tr[5] = inv11;
        dst._tr[6] = inv21;
        dst._tr[7] = 0.0;
        dst._tr[8] = inv02;
        dst._tr[9] = inv12;
        dst._tr[10] = inv22;
        dst._tr[11] = 0.0;
        dst._tr[12] = -(inv00 * tx + inv01 * ty + inv02 * tz);
        dst._tr[13] = -(inv10 * tx + inv11 * ty + inv12 * tz);
        dst._tr[14] = -(inv20 * tx + inv21 * ty + inv22 * tz);
        dst._tr[15] = 1.0;
        return dst;
    }
    clone() {
        const cloneMatrix = new CubismMatrix44();
        for(let i = 0; i < this._tr.length; i++){
            cloneMatrix._tr[i] = this._tr[i];
        }
        return cloneMatrix;
    }
    _tr;
}
import * as $ from './cubismmatrix44.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismMatrix44 = $.CubismMatrix44;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
