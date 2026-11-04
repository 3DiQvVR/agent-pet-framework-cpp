import { CubismMath } from '../math/cubismmath.js';
import { CubismModel, NoParentIndex } from '../model/cubismmodel.js';
import { csmRect } from '../type/csmrectf.js';
import { CubismLogError } from '../utils/cubismdebug.js';
import { updateSize } from '../utils/cubismarrayutils.js';
import { CubismClippingManager } from './cubismclippingmanager.js';
import { CubismClippingContext, CubismRenderer, DrawableObjectType } from './cubismrenderer.js';
import { CubismShaderManager_WebGL } from './cubismshader_webgl.js';
const s_invalidValue = -1;
const s_renderTargetIndexArray = new Uint16Array([
    0,
    1,
    2,
    2,
    1,
    3
]);
export class CubismClippingManager_WebGL extends CubismClippingManager {
    setGL(gl) {
        this.gl = gl;
    }
    constructor(){
        super(CubismClippingContext_WebGL);
    }
    setupClippingContext(model, renderer, lastFbo, lastViewport, drawObjectType) {
        let usingClipCount = 0;
        for(let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++){
            const cc = this._clippingContextListForMask[clipIndex];
            switch(drawObjectType){
                case DrawableObjectType.DrawableObjectType_Drawable:
                default:
                    this.calcClippedDrawableTotalBounds(model, cc);
                    break;
                case DrawableObjectType.DrawableObjectType_Offscreen:
                    this.calcClippedOffscreenTotalBounds(model, cc);
                    break;
            }
            if (cc._isUsing) {
                usingClipCount++;
            }
        }
        if (usingClipCount <= 0) {
            return;
        }
        this.gl.viewport(0, 0, this._clippingMaskBufferSize, this._clippingMaskBufferSize);
        switch(drawObjectType){
            case DrawableObjectType.DrawableObjectType_Drawable:
            default:
                this._currentMaskBuffer = renderer.getDrawableMaskBuffer(0);
                break;
            case DrawableObjectType.DrawableObjectType_Offscreen:
                this._currentMaskBuffer = renderer.getOffscreenMaskBuffer(0);
                break;
        }
        this._currentMaskBuffer.beginDraw(lastFbo);
        renderer.preDraw();
        this.setupLayoutBounds(usingClipCount);
        if (this._clearedMaskBufferFlags.length != this._renderTextureCount) {
            this._clearedMaskBufferFlags.length = 0;
            this._clearedMaskBufferFlags = new Array(this._renderTextureCount);
            for(let i = 0; i < this._clearedMaskBufferFlags.length; i++){
                this._clearedMaskBufferFlags[i] = false;
            }
        }
        for(let index = 0; index < this._clearedMaskBufferFlags.length; index++){
            this._clearedMaskBufferFlags[index] = false;
        }
        for(let clipIndex = 0; clipIndex < this._clippingContextListForMask.length; clipIndex++){
            const clipContext = this._clippingContextListForMask[clipIndex];
            const allClipedDrawRect = clipContext._allClippedDrawRect;
            const layoutBoundsOnTex01 = clipContext._layoutBounds;
            const margin = 0.05;
            let scaleX = 0;
            let scaleY = 0;
            let maskBuffer;
            switch(drawObjectType){
                case DrawableObjectType.DrawableObjectType_Drawable:
                default:
                    maskBuffer = renderer.getDrawableMaskBuffer(clipContext._bufferIndex);
                    break;
                case DrawableObjectType.DrawableObjectType_Offscreen:
                    maskBuffer = renderer.getOffscreenMaskBuffer(clipContext._bufferIndex);
                    break;
            }
            if (this._currentMaskBuffer != maskBuffer) {
                this._currentMaskBuffer.endDraw();
                this._currentMaskBuffer = maskBuffer;
                this._currentMaskBuffer.beginDraw(lastFbo);
                renderer.preDraw();
            }
            this._tmpBoundsOnModel.setRect(allClipedDrawRect);
            this._tmpBoundsOnModel.expand(allClipedDrawRect.width * margin, allClipedDrawRect.height * margin);
            scaleX = layoutBoundsOnTex01.width / this._tmpBoundsOnModel.width;
            scaleY = layoutBoundsOnTex01.height / this._tmpBoundsOnModel.height;
            this.createMatrixForMask(false, layoutBoundsOnTex01, scaleX, scaleY);
            clipContext._matrixForMask.setMatrix(this._tmpMatrixForMask.getArray());
            clipContext._matrixForDraw.setMatrix(this._tmpMatrixForDraw.getArray());
            if (drawObjectType == DrawableObjectType.DrawableObjectType_Offscreen) {
                const invertMvp = renderer.getMvpMatrix().getInvert();
                clipContext._matrixForDraw.multiplyByMatrix(invertMvp);
            }
            const clipDrawCount = clipContext._clippingIdCount;
            for(let i = 0; i < clipDrawCount; i++){
                const clipDrawIndex = clipContext._clippingIdList[i];
                if (!model.getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
                    continue;
                }
                renderer.setIsCulling(model.getDrawableCulling(clipDrawIndex) != false);
                if (!this._clearedMaskBufferFlags[clipContext._bufferIndex]) {
                    this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
                    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
                    this._clearedMaskBufferFlags[clipContext._bufferIndex] = true;
                }
                renderer.setClippingContextBufferForMask(clipContext);
                renderer.drawMeshWebGL(model, clipDrawIndex);
            }
        }
        this._currentMaskBuffer.endDraw();
        renderer.setClippingContextBufferForMask(null);
        this.gl.viewport(lastViewport[0], lastViewport[1], lastViewport[2], lastViewport[3]);
    }
    getClippingMaskCount() {
        return this._clippingContextListForMask.length;
    }
    _currentMaskBuffer;
    gl;
}
export class CubismClippingContext_WebGL extends CubismClippingContext {
    constructor(manager, clippingDrawableIndices, clipCount){
        super(clippingDrawableIndices, clipCount);
        this._owner = manager;
    }
    getClippingManager() {
        return this._owner;
    }
    setGl(gl) {
        this._owner.setGL(gl);
    }
    _owner;
}
export class CubismRendererProfile_WebGL {
    setGlEnable(index, enabled) {
        if (enabled) this.gl.enable(index);
        else this.gl.disable(index);
    }
    setGlEnableVertexAttribArray(index, enabled) {
        if (enabled) this.gl.enableVertexAttribArray(index);
        else this.gl.disableVertexAttribArray(index);
    }
    save() {
        if (this.gl == null) {
            CubismLogError("'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function.");
            return;
        }
        this._lastArrayBufferBinding = this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING);
        this._lastElementArrayBufferBinding = this.gl.getParameter(this.gl.ELEMENT_ARRAY_BUFFER_BINDING);
        this._lastProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM);
        this._lastActiveTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE);
        this.gl.activeTexture(this.gl.TEXTURE1);
        this._lastTexture1Binding2D = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this._lastTexture0Binding2D = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D);
        this._lastVertexAttribArrayEnabled[0] = this.gl.getVertexAttrib(0, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
        this._lastVertexAttribArrayEnabled[1] = this.gl.getVertexAttrib(1, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
        this._lastVertexAttribArrayEnabled[2] = this.gl.getVertexAttrib(2, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
        this._lastVertexAttribArrayEnabled[3] = this.gl.getVertexAttrib(3, this.gl.VERTEX_ATTRIB_ARRAY_ENABLED);
        this._lastScissorTest = this.gl.isEnabled(this.gl.SCISSOR_TEST);
        this._lastStencilTest = this.gl.isEnabled(this.gl.STENCIL_TEST);
        this._lastDepthTest = this.gl.isEnabled(this.gl.DEPTH_TEST);
        this._lastCullFace = this.gl.isEnabled(this.gl.CULL_FACE);
        this._lastBlend = this.gl.isEnabled(this.gl.BLEND);
        this._lastFrontFace = this.gl.getParameter(this.gl.FRONT_FACE);
        this._lastColorMask = this.gl.getParameter(this.gl.COLOR_WRITEMASK);
        this._lastBlending[0] = this.gl.getParameter(this.gl.BLEND_SRC_RGB);
        this._lastBlending[1] = this.gl.getParameter(this.gl.BLEND_DST_RGB);
        this._lastBlending[2] = this.gl.getParameter(this.gl.BLEND_SRC_ALPHA);
        this._lastBlending[3] = this.gl.getParameter(this.gl.BLEND_DST_ALPHA);
    }
    restore() {
        if (this.gl == null) {
            CubismLogError("'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function.");
            return;
        }
        this.gl.useProgram(this._lastProgram);
        this.setGlEnableVertexAttribArray(0, this._lastVertexAttribArrayEnabled[0]);
        this.setGlEnableVertexAttribArray(1, this._lastVertexAttribArrayEnabled[1]);
        this.setGlEnableVertexAttribArray(2, this._lastVertexAttribArrayEnabled[2]);
        this.setGlEnableVertexAttribArray(3, this._lastVertexAttribArrayEnabled[3]);
        this.setGlEnable(this.gl.SCISSOR_TEST, this._lastScissorTest);
        this.setGlEnable(this.gl.STENCIL_TEST, this._lastStencilTest);
        this.setGlEnable(this.gl.DEPTH_TEST, this._lastDepthTest);
        this.setGlEnable(this.gl.CULL_FACE, this._lastCullFace);
        this.setGlEnable(this.gl.BLEND, this._lastBlend);
        this.gl.frontFace(this._lastFrontFace);
        this.gl.colorMask(this._lastColorMask[0], this._lastColorMask[1], this._lastColorMask[2], this._lastColorMask[3]);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this._lastArrayBufferBinding);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this._lastElementArrayBufferBinding);
        this.gl.activeTexture(this.gl.TEXTURE1);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture1Binding2D);
        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, this._lastTexture0Binding2D);
        this.gl.activeTexture(this._lastActiveTexture);
        this.gl.blendFuncSeparate(this._lastBlending[0], this._lastBlending[1], this._lastBlending[2], this._lastBlending[3]);
    }
    setGl(gl) {
        this.gl = gl;
    }
    constructor(){
        this._lastVertexAttribArrayEnabled = new Array(4);
        this._lastColorMask = new Array(4);
        this._lastBlending = new Array(4);
    }
    _lastArrayBufferBinding;
    _lastElementArrayBufferBinding;
    _lastProgram;
    _lastActiveTexture;
    _lastTexture0Binding2D;
    _lastTexture1Binding2D;
    _lastVertexAttribArrayEnabled;
    _lastScissorTest;
    _lastBlend;
    _lastStencilTest;
    _lastDepthTest;
    _lastCullFace;
    _lastFrontFace;
    _lastColorMask;
    _lastBlending;
    gl;
}
export class CubismRenderer_WebGL extends CubismRenderer {
    initialize(model, maskBufferCount = 1) {
        if (model.isUsingMasking()) {
            this._drawableClippingManager = new CubismClippingManager_WebGL();
            this._drawableClippingManager.initializeForDrawable(model, maskBufferCount);
        }
        if (model.isUsingMaskingForOffscreen()) {
            this._offscreenClippingManager = new CubismClippingManager_WebGL();
            this._offscreenClippingManager.initializeForOffscreen(model, maskBufferCount);
        }
        updateSize(this._sortedObjectsIndexList, model.getDrawableCount() + (model.getOffscreenCount ? model.getOffscreenCount() : 0), 0, true);
        updateSize(this._sortedObjectsTypeList, model.getDrawableCount() + (model.getOffscreenCount ? model.getOffscreenCount() : 0), 0, true);
        super.initialize(model);
    }
    setupParentOffscreens(model, offscreenCount) {
        let parentOffscreen;
        for(let offscreenIndex = 0; offscreenIndex < offscreenCount; ++offscreenIndex){
            parentOffscreen = null;
            const ownerIndex = model.getOffscreenOwnerIndices()[offscreenIndex];
            let parentIndex = model.getPartParentPartIndices()[ownerIndex];
            while(parentIndex != NoParentIndex){
                for(let i = 0; i < offscreenCount; ++i){
                    const ownerIndex = model.getOffscreenOwnerIndices()[this._offscreenList[i].getOffscreenIndex()];
                    if (ownerIndex != parentIndex) {
                        continue;
                    }
                    parentOffscreen = this._offscreenList[i];
                    break;
                }
                if (parentOffscreen != null) {
                    break;
                }
                parentIndex = model.getPartParentPartIndices()[parentIndex];
            }
            this._offscreenList[offscreenIndex].setParentPartOffscreen(parentOffscreen);
        }
    }
    bindTexture(modelTextureNo, glTexture) {
        this._textures.set(modelTextureNo, glTexture);
    }
    getBindedTextures() {
        return this._textures;
    }
    setClippingMaskBufferSize(size) {
        if (!this._model.isUsingMasking()) {
            return;
        }
        const renderTextureCount = this._drawableClippingManager.getRenderTextureCount();
        this._drawableClippingManager.release();
        this._drawableClippingManager = void 0;
        this._drawableClippingManager = null;
        this._drawableClippingManager = new CubismClippingManager_WebGL();
        this._drawableClippingManager.setClippingMaskBufferSize(size);
        this._drawableClippingManager.initializeForDrawable(this.getModel(), renderTextureCount);
    }
    getClippingMaskBufferSize() {
        return this._model.isUsingMasking() ? this._drawableClippingManager.getClippingMaskBufferSize() : s_invalidValue;
    }
    getModelRenderTarget(index) {
        return this._modelRenderTargets[index];
    }
    getRenderTextureCount() {
        return this._model.isUsingMasking() ? this._drawableClippingManager.getRenderTextureCount() : s_invalidValue;
    }
    constructor(width, height){
        super(width, height);
        this._clippingContextBufferForMask = null;
        this._clippingContextBufferForDraw = null;
        this._rendererProfile = new CubismRendererProfile_WebGL();
        this._textures = new Map();
        this._sortedObjectsIndexList = new Array();
        this._sortedObjectsTypeList = new Array();
        this._bufferData = {
            vertex: WebGLBuffer = null,
            uv: WebGLBuffer = null,
            index: WebGLBuffer = null
        };
        this._modelRenderTargets = new Array();
        this._drawableMasks = new Array();
        this._currentFbo = null;
        this._drawableClippingManager = null;
        this._offscreenClippingManager = null;
        this._offscreenMasks = new Array();
        this._offscreenList = new Array();
    }
    release() {
        if (this._drawableClippingManager) {
            this._drawableClippingManager.release();
            this._drawableClippingManager = void 0;
            this._drawableClippingManager = null;
        }
        if (this.gl == null) {
            return;
        }
        this.gl.deleteBuffer(this._bufferData.vertex);
        this._bufferData.vertex = null;
        this.gl.deleteBuffer(this._bufferData.uv);
        this._bufferData.uv = null;
        this.gl.deleteBuffer(this._bufferData.index);
        this._bufferData.index = null;
        this._bufferData = null;
        this._textures = null;
        for(let i = 0; i < this._modelRenderTargets.length; i++){
            if (this._modelRenderTargets[i] != null && this._modelRenderTargets[i].isValid()) {
                this._modelRenderTargets[i].destroyRenderTarget();
            }
        }
        this._modelRenderTargets.length = 0;
        this._modelRenderTargets = null;
        for(let i = 0; i < this._drawableMasks.length; i++){
            if (this._drawableMasks[i] != null && this._drawableMasks[i].isValid()) {
                this._drawableMasks[i].destroyRenderTarget();
            }
        }
        this._drawableMasks.length = 0;
        this._drawableMasks = null;
        for(let i = 0; i < this._offscreenMasks.length; i++){
            if (this._offscreenMasks[i] != null && this._offscreenMasks[i].isValid()) {
                this._offscreenMasks[i].destroyRenderTarget();
            }
        }
        this._offscreenMasks.length = 0;
        this._offscreenMasks = null;
        for(let i = 0; i < this._offscreenList.length; i++){
            if (this._offscreenList[i] != null && this._offscreenList[i].isValid()) {
                this._offscreenList[i].destroyRenderTarget();
            }
        }
        this._offscreenList.length = 0;
        this._offscreenList = null;
        this._offscreenClippingManager = null;
        this._drawableClippingManager = null;
        this._clippingContextBufferForMask = null;
        this._clippingContextBufferForDraw = null;
        this._rendererProfile = null;
        this._sortedObjectsIndexList = null;
        this._sortedObjectsTypeList = null;
        this._currentFbo = null;
        this._model = null;
        this.gl = null;
    }
    loadShaders(shaderPath = null) {
        if (this.gl == null) {
            CubismLogError("'gl' is null. WebGLRenderingContext is required.\nPlease call 'CubimRenderer_WebGL.startUp' function.");
            return;
        }
        if (CubismShaderManager_WebGL.getInstance().getShader(this.gl)._shaderSets.length == 0 || !CubismShaderManager_WebGL.getInstance().getShader(this.gl)._isShaderLoaded) {
            const shader = CubismShaderManager_WebGL.getInstance().getShader(this.gl);
            if (shaderPath != null) {
                shader.setShaderPath(shaderPath);
            }
            shader.generateShaders();
        }
    }
    doDrawModel(shaderPath = null) {
        this.loadShaders(shaderPath);
        this.beforeDrawModelRenderTarget();
        const lastFbo = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING);
        const lastViewport = this.gl.getParameter(this.gl.VIEWPORT);
        if (this._drawableClippingManager != null) {
            this.preDraw();
            for(let i = 0; i < this._drawableClippingManager.getRenderTextureCount(); ++i){
                if (this._drawableMasks[i].getBufferWidth() != this._drawableClippingManager.getClippingMaskBufferSize() || this._drawableMasks[i].getBufferHeight() != this._drawableClippingManager.getClippingMaskBufferSize()) {
                    this._drawableMasks[i].createRenderTarget(this.gl, this._drawableClippingManager.getClippingMaskBufferSize(), this._drawableClippingManager.getClippingMaskBufferSize(), lastFbo);
                }
            }
            if (this.isUsingHighPrecisionMask()) {
                this._drawableClippingManager.setupMatrixForHighPrecision(this.getModel(), false);
            } else {
                this._drawableClippingManager.setupClippingContext(this.getModel(), this, lastFbo, lastViewport, DrawableObjectType.DrawableObjectType_Drawable);
            }
        }
        if (this._offscreenClippingManager != null) {
            this.preDraw();
            for(let i = 0; i < this._offscreenClippingManager.getRenderTextureCount(); ++i){
                if (this._offscreenMasks[i].getBufferWidth() != this._offscreenClippingManager.getClippingMaskBufferSize() || this._offscreenMasks[i].getBufferHeight() != this._offscreenClippingManager.getClippingMaskBufferSize()) {
                    this._offscreenMasks[i].createRenderTarget(this.gl, this._offscreenClippingManager.getClippingMaskBufferSize(), this._offscreenClippingManager.getClippingMaskBufferSize(), lastFbo);
                }
            }
            if (this.isUsingHighPrecisionMask()) {
                this._offscreenClippingManager.setupMatrixForOffscreenHighPrecision(this.getModel(), false, this.getMvpMatrix());
            } else {
                this._offscreenClippingManager.setupClippingContext(this.getModel(), this, lastFbo, lastViewport, DrawableObjectType.DrawableObjectType_Offscreen);
            }
        }
        this.preDraw();
        this.drawObjectLoop(lastFbo);
        this.afterDrawModelRenderTarget();
    }
    drawObjectLoop(lastFbo) {
        const model = this.getModel();
        const drawableCount = model.getDrawableCount();
        const offscreenCount = model.getOffscreenCount();
        const totalCount = drawableCount + offscreenCount;
        const renderOrder = model.getRenderOrders();
        this._currentOffscreen = null;
        this._currentFbo = lastFbo;
        this._modelRootFbo = lastFbo;
        for(let i = 0; i < totalCount; ++i){
            const order = renderOrder[i];
            if (i < drawableCount) {
                this._sortedObjectsIndexList[order] = i;
                this._sortedObjectsTypeList[order] = DrawableObjectType.DrawableObjectType_Drawable;
            } else if (i < totalCount) {
                this._sortedObjectsIndexList[order] = i - drawableCount;
                this._sortedObjectsTypeList[order] = DrawableObjectType.DrawableObjectType_Offscreen;
            }
        }
        for(let i = 0; i < totalCount; ++i){
            const objectIndex = this._sortedObjectsIndexList[i];
            const objectType = this._sortedObjectsTypeList[i];
            this.renderObject(objectIndex, objectType);
        }
        while(this._currentOffscreen != null){
            this.submitDrawToParentOffscreen(this._currentOffscreen.getOffscreenIndex(), DrawableObjectType.DrawableObjectType_Offscreen);
        }
    }
    renderObject(objectIndex, objectType) {
        switch(objectType){
            case DrawableObjectType.DrawableObjectType_Drawable:
                this.drawDrawable(objectIndex, this._modelRootFbo);
                break;
            case DrawableObjectType.DrawableObjectType_Offscreen:
                this.addOffscreen(objectIndex);
                break;
            default:
                CubismLogError('Unknown object type: ' + objectType);
                break;
        }
    }
    drawDrawable(drawableIndex, rootFbo) {
        if (!this.getModel().getDrawableDynamicFlagIsVisible(drawableIndex)) {
            return;
        }
        this.submitDrawToParentOffscreen(drawableIndex, DrawableObjectType.DrawableObjectType_Drawable);
        const clipContext = this._drawableClippingManager != null ? this._drawableClippingManager.getClippingContextListForDraw()[drawableIndex] : null;
        if (clipContext != null && this.isUsingHighPrecisionMask()) {
            if (clipContext._isUsing) {
                this.gl.viewport(0, 0, this._drawableClippingManager.getClippingMaskBufferSize(), this._drawableClippingManager.getClippingMaskBufferSize());
                this.preDraw();
                this.getDrawableMaskBuffer(clipContext._bufferIndex).beginDraw(this._currentFbo);
                this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
                this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            }
            {
                const clipDrawCount = clipContext._clippingIdCount;
                for(let index = 0; index < clipDrawCount; index++){
                    const clipDrawIndex = clipContext._clippingIdList[index];
                    if (!this._model.getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
                        continue;
                    }
                    this.setIsCulling(this._model.getDrawableCulling(clipDrawIndex) != false);
                    this.setClippingContextBufferForMask(clipContext);
                    this.drawMeshWebGL(this._model, clipDrawIndex);
                }
                this.getDrawableMaskBuffer(clipContext._bufferIndex).endDraw();
                this.setClippingContextBufferForMask(null);
                this.gl.viewport(0, 0, this._modelRenderTargetWidth, this._modelRenderTargetHeight);
                this.preDraw();
            }
        }
        this.setClippingContextBufferForDrawable(clipContext);
        this.setIsCulling(this.getModel().getDrawableCulling(drawableIndex));
        this.drawMeshWebGL(this._model, drawableIndex);
    }
    drawMeshWebGL(model, index) {
        if (this.isCulling()) {
            this.gl.enable(this.gl.CULL_FACE);
        } else {
            this.gl.disable(this.gl.CULL_FACE);
        }
        this.gl.frontFace(this.gl.CCW);
        if (this.isGeneratingMask()) {
            CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForMask(this, model, index);
        } else {
            CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForDrawable(this, model, index);
        }
        if (!CubismShaderManager_WebGL.getInstance().getShader(this.gl)._isShaderLoaded) {
            return;
        }
        {
            const indexCount = model.getDrawableVertexIndexCount(index);
            this.gl.drawElements(this.gl.TRIANGLES, indexCount, this.gl.UNSIGNED_SHORT, 0);
        }
        this.gl.useProgram(null);
        this.setClippingContextBufferForDrawable(null);
        this.setClippingContextBufferForMask(null);
    }
    submitDrawToParentOffscreen(objectIndex, objectType) {
        if (this._currentOffscreen == null || objectIndex == s_invalidValue) {
            return;
        }
        const currentOwnerIndex = this.getModel().getOffscreenOwnerIndices()[this._currentOffscreen.getOffscreenIndex()];
        if (currentOwnerIndex == s_invalidValue) {
            return;
        }
        let targetParentIndex = NoParentIndex;
        switch(objectType){
            case DrawableObjectType.DrawableObjectType_Drawable:
                targetParentIndex = this.getModel().getDrawableParentPartIndex(objectIndex);
                break;
            case DrawableObjectType.DrawableObjectType_Offscreen:
                targetParentIndex = this.getModel().getPartParentPartIndices()[this.getModel().getOffscreenOwnerIndices()[objectIndex]];
                break;
            default:
                return;
        }
        while(targetParentIndex != NoParentIndex){
            if (targetParentIndex == currentOwnerIndex) {
                return;
            }
            targetParentIndex = this.getModel().getPartParentPartIndices()[targetParentIndex];
        }
        this.drawOffscreen(this._currentOffscreen);
        this.submitDrawToParentOffscreen(objectIndex, objectType);
    }
    addOffscreen(offscreenIndex) {
        if (this._currentOffscreen != null && this._currentOffscreen.getOffscreenIndex() != offscreenIndex) {
            let isParent = false;
            const ownerIndex = this.getModel().getOffscreenOwnerIndices()[offscreenIndex];
            let parentIndex = this.getModel().getPartParentPartIndices()[ownerIndex];
            const currentOffscreenIndex = this._currentOffscreen.getOffscreenIndex();
            const currentOffscreenOwnerIndex = this.getModel().getOffscreenOwnerIndices()[currentOffscreenIndex];
            while(parentIndex != NoParentIndex){
                if (parentIndex == currentOffscreenOwnerIndex) {
                    isParent = true;
                    break;
                }
                parentIndex = this.getModel().getPartParentPartIndices()[parentIndex];
            }
            if (!isParent) {
                this.submitDrawToParentOffscreen(offscreenIndex, DrawableObjectType.DrawableObjectType_Offscreen);
            }
        }
        const offscreen = this._offscreenList[offscreenIndex];
        if (offscreen.getRenderTexture() == null || offscreen.getBufferWidth() != this._modelRenderTargetWidth || offscreen.getBufferHeight() != this._modelRenderTargetHeight || offscreen.getUsingRenderTextureState()) {
            offscreen.setOffscreenRenderTarget(this.gl, this._modelRenderTargetWidth, this._modelRenderTargetHeight, this._currentFbo);
        } else {
            offscreen.startUsingRenderTexture();
        }
        const oldOffscreen = offscreen.getParentPartOffscreen();
        offscreen.setOldOffscreen(oldOffscreen);
        let oldFBO = null;
        if (oldOffscreen != null) {
            oldFBO = oldOffscreen.getRenderTexture();
        }
        if (oldFBO == null) {
            oldFBO = this._modelRootFbo;
        }
        offscreen.beginDraw(oldFBO);
        this.gl.viewport(0, 0, this._modelRenderTargetWidth, this._modelRenderTargetHeight);
        offscreen.clear(0.0, 0.0, 0.0, 0.0);
        this._currentOffscreen = offscreen;
        this._currentFbo = offscreen.getRenderTexture();
    }
    drawOffscreen(offscreen) {
        const offscreenIndex = offscreen.getOffscreenIndex();
        const clipContext = this._offscreenClippingManager != null ? this._offscreenClippingManager.getClippingContextListForOffscreen()[offscreenIndex] : null;
        if (clipContext != null && this.isUsingHighPrecisionMask()) {
            if (clipContext._isUsing) {
                this.gl.viewport(0, 0, this._offscreenClippingManager.getClippingMaskBufferSize(), this._offscreenClippingManager.getClippingMaskBufferSize());
                this.preDraw();
                this.getOffscreenMaskBuffer(clipContext._bufferIndex).beginDraw(this._currentFbo);
                this.gl.clearColor(1.0, 1.0, 1.0, 1.0);
                this.gl.clear(this.gl.COLOR_BUFFER_BIT);
            }
            {
                const clipDrawCount = clipContext._clippingIdCount;
                for(let index = 0; index < clipDrawCount; index++){
                    const clipDrawIndex = clipContext._clippingIdList[index];
                    if (!this.getModel().getDrawableDynamicFlagVertexPositionsDidChange(clipDrawIndex)) {
                        continue;
                    }
                    this.setIsCulling(this.getModel().getDrawableCulling(clipDrawIndex) != false);
                    this.setClippingContextBufferForMask(clipContext);
                    this.drawMeshWebGL(this.getModel(), clipDrawIndex);
                }
            }
            {
                this.getOffscreenMaskBuffer(clipContext._bufferIndex).endDraw();
                this.setClippingContextBufferForMask(null);
                this.gl.viewport(0, 0, this._modelRenderTargetWidth, this._modelRenderTargetHeight);
                this.preDraw();
            }
        }
        this.setClippingContextBufferForOffscreen(clipContext);
        this.setIsCulling(this._model.getOffscreenCulling(offscreenIndex) != false);
        this.drawOffscreenWebGL(this.getModel(), offscreen);
    }
    drawOffscreenWebGL(model, offscreen) {
        if (this.isCulling()) {
            this.gl.enable(this.gl.CULL_FACE);
        } else {
            this.gl.disable(this.gl.CULL_FACE);
        }
        this.gl.frontFace(this.gl.CCW);
        CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForOffscreen(this, model, offscreen);
        offscreen.endDraw();
        this._currentOffscreen = this._currentOffscreen.getOldOffscreen();
        this._currentFbo = offscreen.getOldFBO();
        if (this._currentFbo == null) {
            this._currentOffscreen = this._modelRenderTargets[0];
            this._currentFbo = this._modelRenderTargets[0].getRenderTexture();
            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this._currentFbo);
        }
        {
            const indexBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, s_renderTargetIndexArray, this.gl.STATIC_DRAW);
            this.gl.drawElements(this.gl.TRIANGLES, s_renderTargetIndexArray.length, this.gl.UNSIGNED_SHORT, 0);
            this.gl.deleteBuffer(indexBuffer);
        }
        offscreen.stopUsingRenderTexture();
        this.gl.useProgram(null);
        this.setClippingContextBufferForMask(null);
        this.setClippingContextBufferForOffscreen(null);
    }
    saveProfile() {
        this._rendererProfile.save();
    }
    restoreProfile() {
        this._rendererProfile.restore();
    }
    beforeDrawModelRenderTarget() {
        if (this._modelRenderTargets.length == 0) {
            return;
        }
        for(let i = 0; i < this._modelRenderTargets.length; ++i){
            if (this._modelRenderTargets[i].getBufferWidth() != this._modelRenderTargetWidth || this._modelRenderTargets[i].getBufferHeight() != this._modelRenderTargetHeight) {
                this._modelRenderTargets[i].createRenderTarget(this.gl, this._modelRenderTargetWidth, this._modelRenderTargetHeight, this._currentFbo);
            }
        }
        this._modelRenderTargets[0].beginDraw();
        this._modelRenderTargets[0].clear(0.0, 0.0, 0.0, 0.0);
    }
    afterDrawModelRenderTarget() {
        if (this._modelRenderTargets.length == 0) {
            return;
        }
        this._modelRenderTargets[0].endDraw();
        CubismShaderManager_WebGL.getInstance().getShader(this.gl).setupShaderProgramForOffscreenRenderTarget(this);
        if (CubismShaderManager_WebGL.getInstance().getShader(this.gl)._isShaderLoaded) {
            const indexBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, s_renderTargetIndexArray, this.gl.STATIC_DRAW);
            this.gl.drawElements(this.gl.TRIANGLES, s_renderTargetIndexArray.length, this.gl.UNSIGNED_SHORT, 0);
            this.gl.deleteBuffer(indexBuffer);
        }
        this.gl.useProgram(null);
    }
    getOffscreenMaskBuffer(index) {
        return this._offscreenMasks[index];
    }
    static doStaticRelease() {
        CubismShaderManager_WebGL.deleteInstance();
    }
    setRenderState(fbo, viewport) {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
        this.gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
        if (this._modelRenderTargetWidth != viewport[2] || this._modelRenderTargetHeight != viewport[3]) {
            this._modelRenderTargetWidth = viewport[2];
            this._modelRenderTargetHeight = viewport[3];
        }
    }
    preDraw() {
        this.gl.disable(this.gl.SCISSOR_TEST);
        this.gl.disable(this.gl.STENCIL_TEST);
        this.gl.disable(this.gl.DEPTH_TEST);
        this.gl.frontFace(this.gl.CW);
        this.gl.enable(this.gl.BLEND);
        this.gl.colorMask(true, true, true, true);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
        if (this.getAnisotropy() > 0.0 && this._extension) {
            for(let i = 0; i < this._textures.size; ++i){
                this.gl.bindTexture(this.gl.TEXTURE_2D, this._textures.get(i));
                this.gl.texParameterf(this.gl.TEXTURE_2D, this._extension.TEXTURE_MAX_ANISOTROPY_EXT, this.getAnisotropy());
            }
        }
    }
    getDrawableMaskBuffer(index) {
        return this._drawableMasks[index];
    }
    setClippingContextBufferForMask(clip) {
        this._clippingContextBufferForMask = clip;
    }
    getClippingContextBufferForMask() {
        return this._clippingContextBufferForMask;
    }
    setClippingContextBufferForDrawable(clip) {
        this._clippingContextBufferForDraw = clip;
    }
    getClippingContextBufferForDrawable() {
        return this._clippingContextBufferForDraw;
    }
    setClippingContextBufferForOffscreen(clip) {
        this._clippingContextBufferForOffscreen = clip;
    }
    getClippingContextBufferForOffscreen() {
        return this._clippingContextBufferForOffscreen;
    }
    isGeneratingMask() {
        return this.getClippingContextBufferForMask() != null;
    }
    startUp(gl) {
        this.gl = gl;
        if (this._drawableClippingManager) {
            this._drawableClippingManager.setGL(gl);
        }
        if (this._offscreenClippingManager) {
            this._offscreenClippingManager.setGL(gl);
        }
        CubismShaderManager_WebGL.getInstance().setGlContext(gl);
        this._rendererProfile.setGl(gl);
        this._extension = this.gl.getExtension('EXT_texture_filter_anisotropic') || this.gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') || this.gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
        if (this._model.isUsingMasking()) {
            this._drawableMasks.length = this._drawableClippingManager.getRenderTextureCount();
            for(let i = 0; i < this._drawableMasks.length; ++i){
                const renderTarget = new CubismRenderTarget_WebGL();
                renderTarget.createRenderTarget(this.gl, this._drawableClippingManager.getClippingMaskBufferSize(), this._drawableClippingManager.getClippingMaskBufferSize(), this._currentFbo);
                this._drawableMasks[i] = renderTarget;
            }
        }
        if (this._model.isBlendModeEnabled()) {
            this._modelRenderTargets.length = 0;
            const createSize = 3;
            this._modelRenderTargets.length = createSize;
            for(let i = 0; i < createSize; ++i){
                const offscreenRenderTarget = new CubismOffscreenRenderTarget_WebGL();
                offscreenRenderTarget.createRenderTarget(this.gl, this._modelRenderTargetWidth, this._modelRenderTargetHeight, this._currentFbo);
                this._modelRenderTargets[i] = offscreenRenderTarget;
            }
            if (this._model.isUsingMaskingForOffscreen()) {
                this._offscreenMasks.length = this._offscreenClippingManager.getRenderTextureCount();
                for(let i = 0; i < this._offscreenMasks.length; ++i){
                    const offscreenMask = new CubismRenderTarget_WebGL();
                    offscreenMask.createRenderTarget(this.gl, this._offscreenClippingManager.getClippingMaskBufferSize(), this._offscreenClippingManager.getClippingMaskBufferSize(), this._currentFbo);
                    this._offscreenMasks[i] = offscreenMask;
                }
            }
            const offscreenCount = this._model.getOffscreenCount();
            if (offscreenCount > 0) {
                this._offscreenList = new Array(offscreenCount);
                for(let offscreenIndex = 0; offscreenIndex < offscreenCount; ++offscreenIndex){
                    const offscreenRenderTarget = new CubismOffscreenRenderTarget_WebGL();
                    offscreenRenderTarget.setOffscreenIndex(offscreenIndex);
                    this._offscreenList[offscreenIndex] = offscreenRenderTarget;
                }
                this.setupParentOffscreens(this._model, offscreenCount);
            }
        }
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this._currentFbo);
    }
    _textures;
    _sortedObjectsIndexList;
    _sortedObjectsTypeList;
    _rendererProfile;
    _drawableClippingManager;
    _clippingContextBufferForMask;
    _clippingContextBufferForDraw;
    _clippingContextBufferForOffscreen;
    _offscreenClippingManager;
    _modelRenderTargets;
    _drawableMasks;
    _offscreenMasks;
    _offscreenList;
    _currentFbo;
    _currentOffscreen;
    _modelRootFbo;
    _bufferData;
    _extension;
    gl;
}
CubismRenderer.staticRelease = ()=>{
    CubismRenderer_WebGL.doStaticRelease();
};
import * as $ from './cubismrenderer_webgl.js';
import { CubismRenderTarget_WebGL as CubismRenderTarget_WebGL } from './cubismrendertarget_webgl.js';
import { CubismOffscreenRenderTarget_WebGL as CubismOffscreenRenderTarget_WebGL } from './cubismoffscreenrendertarget_webgl.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismClippingContext = $.CubismClippingContext_WebGL;
    Live2DCubismFramework.CubismClippingManager_WebGL = $.CubismClippingManager_WebGL;
    Live2DCubismFramework.CubismRenderer_WebGL = $.CubismRenderer_WebGL;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
