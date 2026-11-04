import { CubismMath } from '../math/cubismmath.js';
import { CubismMatrix44 } from '../math/cubismmatrix44.js';
import { CubismModel } from '../model/cubismmodel.js';
import { csmRect } from '../type/csmrectf.js';
import { ICubismClippingManager } from './cubismclippingmanager.js';
import { CubismLogInfo } from '../utils/cubismdebug.js';
export class CubismRenderer {
    static create() {
        return null;
    }
    static delete(renderer) {
        renderer = null;
    }
    initialize(model) {
        this._model = model;
        if (model.isBlendModeEnabled()) {
            this.useHighPrecisionMask(true);
            CubismLogInfo('This model uses a high-resolution mask because it operates in blend mode.');
        }
    }
    drawModel(shaderPath = null) {
        if (this.getModel() == null) return;
        this.doDrawModel(shaderPath);
    }
    setMvpMatrix(matrix44) {
        this._mvpMatrix4x4.setMatrix(matrix44.getArray());
    }
    getMvpMatrix() {
        return this._mvpMatrix4x4;
    }
    setModelColor(red, green, blue, alpha) {
        this._modelColor.r = CubismMath.clamp(red, 0.0, 1.0);
        this._modelColor.g = CubismMath.clamp(green, 0.0, 1.0);
        this._modelColor.b = CubismMath.clamp(blue, 0.0, 1.0);
        this._modelColor.a = CubismMath.clamp(alpha, 0.0, 1.0);
    }
    getModelColor() {
        return JSON.parse(JSON.stringify(this._modelColor));
    }
    getModelColorWithOpacity(opacity) {
        const modelColorRGBA = this.getModelColor();
        modelColorRGBA.a *= opacity;
        if (this.isPremultipliedAlpha()) {
            modelColorRGBA.r *= modelColorRGBA.a;
            modelColorRGBA.g *= modelColorRGBA.a;
            modelColorRGBA.b *= modelColorRGBA.a;
        }
        return modelColorRGBA;
    }
    setIsPremultipliedAlpha(enable) {
        this._isPremultipliedAlpha = enable;
    }
    isPremultipliedAlpha() {
        return this._isPremultipliedAlpha;
    }
    setIsCulling(culling) {
        this._isCulling = culling;
    }
    isCulling() {
        return this._isCulling;
    }
    setAnisotropy(n) {
        this._anisotropy = n;
    }
    getAnisotropy() {
        return this._anisotropy;
    }
    getModel() {
        return this._model;
    }
    useHighPrecisionMask(high) {
        this._useHighPrecisionMask = high;
    }
    isUsingHighPrecisionMask() {
        return this._useHighPrecisionMask;
    }
    setRenderTargetSize(width, height) {
        this._modelRenderTargetWidth = width;
        this._modelRenderTargetHeight = height;
    }
    constructor(width, height){
        this._modelRenderTargetWidth = width;
        this._modelRenderTargetHeight = height;
        this._isCulling = false;
        this._isPremultipliedAlpha = false;
        this._anisotropy = 0.0;
        this._model = null;
        this._modelColor = new CubismTextureColor();
        this._useHighPrecisionMask = false;
        this._mvpMatrix4x4 = new CubismMatrix44();
        this._mvpMatrix4x4.loadIdentity();
    }
    static staticRelease;
    _mvpMatrix4x4;
    _modelColor;
    _isCulling;
    _isPremultipliedAlpha;
    _anisotropy;
    _model;
    _useHighPrecisionMask;
    _modelRenderTargetWidth;
    _modelRenderTargetHeight;
}
export var CubismBlendMode = /*#__PURE__*/ function(CubismBlendMode) {
    CubismBlendMode[CubismBlendMode["CubismBlendMode_Normal"] = 0] = "CubismBlendMode_Normal";
    CubismBlendMode[CubismBlendMode["CubismBlendMode_Additive"] = 1] = "CubismBlendMode_Additive";
    CubismBlendMode[CubismBlendMode["CubismBlendMode_Multiplicative"] = 2] = "CubismBlendMode_Multiplicative";
    return CubismBlendMode;
}({});
export var DrawableObjectType = /*#__PURE__*/ function(DrawableObjectType) {
    DrawableObjectType[DrawableObjectType["DrawableObjectType_Drawable"] = 0] = "DrawableObjectType_Drawable";
    DrawableObjectType[DrawableObjectType["DrawableObjectType_Offscreen"] = 1] = "DrawableObjectType_Offscreen";
    return DrawableObjectType;
}({});
export class CubismTextureColor {
    constructor(r = 1.0, g = 1.0, b = 1.0, a = 1.0){
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
    }
    r;
    g;
    b;
    a;
}
export class CubismClippingContext {
    constructor(clippingDrawableIndices, clipCount){
        this._clippingIdList = clippingDrawableIndices;
        this._clippingIdCount = clipCount;
        this._allClippedDrawRect = new csmRect();
        this._layoutBounds = new csmRect();
        this._clippedDrawableIndexList = [];
        this._clippedOffscreenIndexList = [];
        this._matrixForMask = new CubismMatrix44();
        this._matrixForDraw = new CubismMatrix44();
        this._bufferIndex = 0;
        this._layoutChannelIndex = 0;
    }
    release() {
        if (this._layoutBounds != null) {
            this._layoutBounds = null;
        }
        if (this._allClippedDrawRect != null) {
            this._allClippedDrawRect = null;
        }
        if (this._clippedDrawableIndexList != null) {
            this._clippedDrawableIndexList = null;
        }
        if (this._clippedOffscreenIndexList != null) {
            this._clippedOffscreenIndexList = null;
        }
    }
    addClippedDrawable(drawableIndex) {
        this._clippedDrawableIndexList.push(drawableIndex);
    }
    addClippedOffscreen(offscreenIndex) {
        this._clippedOffscreenIndexList.push(offscreenIndex);
    }
    _isUsing;
    _clippingIdList;
    _clippingIdCount;
    _layoutChannelIndex;
    _layoutBounds;
    _allClippedDrawRect;
    _matrixForMask;
    _matrixForDraw;
    _clippedDrawableIndexList;
    _clippedOffscreenIndexList;
    _bufferIndex;
}
import * as $ from './cubismrenderer.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismBlendMode = $.CubismBlendMode;
    Live2DCubismFramework.CubismRenderer = $.CubismRenderer;
    Live2DCubismFramework.CubismTextureColor = $.CubismTextureColor;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
