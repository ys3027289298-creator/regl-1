var avif = require('./avif')
var DecodeError = require('./decode-error')

// ---------------------------------------------------------------------------
// Common encoded-image decode layer
//
// Texture creation paths (texture2d, cube, subimage) all funnel through
// parseImage, which calls decodeImage() here when the caller passes
// encoded file bytes together with a `decode` format hint.  Decoded
// images always come back as tightly packed uint8 RGBA.
// ---------------------------------------------------------------------------

var decoders = {
  avif: avif.decodeAVIF
}

// Normalizes caller input to a Uint8Array view.  Views are created over
// the caller's existing buffer, so the encoded file is never copied.
function toByteView (data) {
  if (data instanceof Uint8Array) {
    return data
  }
  if (typeof ArrayBuffer !== 'undefined' &&
      data instanceof ArrayBuffer) {
    return new Uint8Array(data)
  }
  if (typeof ArrayBuffer !== 'undefined' &&
      ArrayBuffer.isView && ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  }
  return null
}

function decodeImage (data, format) {
  var decoder = decoders[format]
  if (!decoder) {
    throw new DecodeError(
      'unsupported texture decode format: ' + format,
      DecodeError.FORMAT)
  }
  var bytes = toByteView(data)
  if (!bytes) {
    throw new DecodeError(
      'encoded texture data must be a Uint8Array or ArrayBuffer',
      DecodeError.DATA)
  }
  return decoder(bytes)
}

decodeImage.DecodeError = DecodeError
decodeImage.isAVIF = avif.isAVIF

module.exports = decodeImage
