import { CubismRenderTarget_WebGL } from './cubismrendertarget_webgl.js';
import { CubismWebGLOffscreenManager } from './cubismoffscreenmanager.js';
import { CubismLogError } from '../utils/cubismdebug.js';
export class CubismOffscreenRenderTarget_WebGL extends CubismRenderTarget_WebGL {
    initializeOffscreenManager(gl, displayBufferWidth, displayBufferHeight) {
        this._gl = gl;
        this._webGLOffscreenManager = CubismWebGLOffscreenManager.getInstance();
        if (this._webGLOffscreenManager.getContainerSize(gl) === 0) {
            this._webGLOffscreenManager.initialize(gl, displayBufferWidth, displayBufferHeight);
        }
    }
    setOffscreenRenderTarget(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer) {
        if (this._webGLOffscreenManager == null) {
            this.initializeOffscreenManager(gl, displayBufferWidth, displayBufferHeight);
        }
        const offscreenRenderTargetContainer = this._webGLOffscreenManager.getOffscreenRenderTargetContainers(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer);
        if (offscreenRenderTargetContainer == null) {
            CubismLogError('Failed to acquire offscreen render texture container.');
            return;
        }
        this._colorBuffer = offscreenRenderTargetContainer.getColorBuffer();
        this._renderTexture = offscreenRenderTargetContainer.getRenderTexture();
        this._bufferWidth = displayBufferWidth;
        this._bufferHeight = displayBufferHeight;
        this._gl = gl;
        if (this._renderTexture == null) {
            this._renderTexture = previousFramebuffer;
            CubismLogError('Failed to create offscreen render texture.');
        }
        return;
    }
    getUsingRenderTextureState() {
        if (this._webGLOffscreenManager == null || this._gl == null) {
            return true;
        }
        return this._webGLOffscreenManager.getUsingRenderTextureState(this._gl, this._renderTexture);
    }
    startUsingRenderTexture() {
        if (this._webGLOffscreenManager == null || this._gl == null) {
            return;
        }
        this._webGLOffscreenManager.startUsingRenderTexture(this._gl, this._renderTexture);
    }
    stopUsingRenderTexture() {
        if (this._webGLOffscreenManager == null || this._gl == null) {
            return;
        }
        this._webGLOffscreenManager.stopUsingRenderTexture(this._gl, this._renderTexture);
    }
    setOffscreenIndex(offscreenIndex) {
        this._offscreenIndex = offscreenIndex;
    }
    getOffscreenIndex() {
        return this._offscreenIndex;
    }
    setOldOffscreen(oldOffscreen) {
        this._oldOffscreen = oldOffscreen;
    }
    getOldOffscreen() {
        return this._oldOffscreen;
    }
    setParentPartOffscreen(parentOffscreenRenderTarget) {
        this._parentOffscreenRenderTarget = parentOffscreenRenderTarget;
    }
    getParentPartOffscreen() {
        return this._parentOffscreenRenderTarget;
    }
    constructor(){
        super();
        this._offscreenIndex = -1;
        this._parentOffscreenRenderTarget = null;
        this._oldOffscreen = null;
        this._webGLOffscreenManager = null;
    }
    release() {
        if (this._webGLOffscreenManager != null && this._gl != null && this._renderTexture != null) {
            this._webGLOffscreenManager.stopUsingRenderTexture(this._gl, this._renderTexture);
        }
        if (this._colorBuffer && this._gl) {
            this._gl.deleteTexture(this._colorBuffer);
            this._colorBuffer = null;
        }
        if (this._renderTexture && this._gl) {
            this._gl.deleteFramebuffer(this._renderTexture);
            this._renderTexture = null;
        }
        if (this._webGLOffscreenManager != null) {
            this._webGLOffscreenManager = null;
        }
        this._oldOffscreen = null;
        this._parentOffscreenRenderTarget = null;
    }
    _offscreenIndex;
    _parentOffscreenRenderTarget;
    _oldOffscreen;
    _webGLOffscreenManager;
    _gl;
}
