import { CubismLogError } from '../utils/cubismdebug.js';
export class CubismRenderTarget_WebGL {
    static copyBuffer(gl, src, dst) {
        if (src == null || dst == null) {
            return;
        }
        if (!(gl instanceof WebGL2RenderingContext)) {
            throw new Error('WebGL2RenderingContext is required for buffer copy.');
        }
        const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.getRenderTexture());
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.getRenderTexture());
        gl.blitFramebuffer(0, 0, src.getBufferWidth(), src.getBufferHeight(), 0, 0, dst.getBufferWidth(), dst.getBufferHeight(), gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    }
    beginDraw(restoreFbo = null) {
        if (this._renderTexture == null) {
            console.error('_renderTexture is null');
            return;
        }
        if (restoreFbo == null) {
            this._oldFbo = this._gl.getParameter(this._gl.FRAMEBUFFER_BINDING);
        } else {
            this._oldFbo = restoreFbo;
        }
        this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._renderTexture);
    }
    endDraw() {
        this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, this._oldFbo);
    }
    clear(r, g, b, a) {
        this._gl.clearColor(r, g, b, a);
        this._gl.clear(this._gl.COLOR_BUFFER_BIT);
    }
    createRenderTarget(gl, displayBufferWidth, displayBufferHeight, previousFramebuffer) {
        this.destroyRenderTarget();
        this._colorBuffer = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this._colorBuffer);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, displayBufferWidth, displayBufferHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.bindTexture(gl.TEXTURE_2D, null);
        const ret = gl.createFramebuffer();
        if (ret == null) {
            CubismLogError('Failed to create framebuffer');
            return false;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, ret);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._colorBuffer, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            CubismLogError('Framebuffer is not complete');
            gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
            gl.deleteFramebuffer(ret);
            this.destroyRenderTarget();
            return false;
        }
        this._renderTexture = ret;
        this._bufferWidth = displayBufferWidth;
        this._bufferHeight = displayBufferHeight;
        this._gl = gl;
        return true;
    }
    destroyRenderTarget() {
        if (this._colorBuffer) {
            this._gl.bindTexture(this._gl.TEXTURE_2D, null);
            this._gl.deleteTexture(this._colorBuffer);
            this._colorBuffer = null;
        }
        if (this._renderTexture) {
            this._gl.bindFramebuffer(this._gl.FRAMEBUFFER, null);
            this._gl.deleteFramebuffer(this._renderTexture);
            this._renderTexture = null;
        }
    }
    getGL() {
        return this._gl;
    }
    getRenderTexture() {
        return this._renderTexture;
    }
    getColorBuffer() {
        return this._colorBuffer;
    }
    getBufferWidth() {
        return this._bufferWidth;
    }
    getBufferHeight() {
        return this._bufferHeight;
    }
    isValid() {
        return this._renderTexture != null;
    }
    getOldFBO() {
        return this._oldFbo;
    }
    constructor(){
        this._gl = null;
        this._colorBuffer = null;
        this._renderTexture = null;
        this._bufferWidth = 0;
        this._bufferHeight = 0;
        this._oldFbo = null;
    }
    _gl;
    _colorBuffer;
    _renderTexture;
    _bufferWidth;
    _bufferHeight;
    _oldFbo;
}
import * as $ from './cubismrendertarget_webgl.js';
(function(Live2DCubismFramework) {
    Live2DCubismFramework.CubismOffscreenSurface_WebGL = $.CubismRenderTarget_WebGL;
})(Live2DCubismFramework || (Live2DCubismFramework = {}));
export var Live2DCubismFramework;
