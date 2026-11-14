// Distinguishable error type for texture image decoding.
//
// Decoding can fail for several reasons (unsupported container, corrupt
// payload, missing decoder backend) and callers need to tell these apart
// from generic regl validation errors.  Every failure raised by the
// decoding layer is a TextureDecodeError carrying a stable `code`.
function TextureDecodeError (message, code) {
  this.name = 'TextureDecodeError'
  this.message = message
  this.code = code
  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, TextureDecodeError)
  } else {
    this.stack = (new Error(message)).stack
  }
}

TextureDecodeError.prototype = Object.create(Error.prototype)
TextureDecodeError.prototype.constructor = TextureDecodeError

// unknown/unsupported container format requested
TextureDecodeError.FORMAT = 'ERR_TEXTURE_DECODE_FORMAT'
// input bytes are not valid encoded image data
TextureDecodeError.DATA = 'ERR_TEXTURE_DECODE_DATA'
// no decoder backend available in this environment
TextureDecodeError.UNSUPPORTED = 'ERR_TEXTURE_DECODE_UNSUPPORTED'
// decoder backend ran but failed to decode the payload
TextureDecodeError.FAILED = 'ERR_TEXTURE_DECODE_FAILED'

module.exports = TextureDecodeError
