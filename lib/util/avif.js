var DecodeError = require('./decode-error')

// ---------------------------------------------------------------------------
// AVIF (AV1 Image File Format) decoding
//
// An AVIF image is an ISO-BMFF container carrying an AV1 bitstream, so
// decoding is delegated to an external ffmpeg/ffprobe pair when one is
// available (Node.js).  The encoded bytes are streamed to the decoder
// through a view onto the caller's buffer, so the file is never copied.
// ---------------------------------------------------------------------------

var FTYPE_OFFSET = 4
var BRAND_OFFSET = 8
var MINOR_OFFSET = 12
var COMPAT_OFFSET = 16
var BOX_HEADER_SIZE = 8

function brandCode (bytes, offset) {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]) >>> 0
}

var BRAND_FTYP = brandCode([0x66, 0x74, 0x79, 0x70], 0) // 'ftyp'
var BRAND_AVIF = brandCode([0x61, 0x76, 0x69, 0x66], 0) // 'avif'
var BRAND_AVIS = brandCode([0x61, 0x76, 0x69, 0x73], 0) // 'avis'

function hasAVIFBrand (bytes, offset, end) {
  for (var i = offset; i + 4 <= end; i += 4) {
    var brand = brandCode(bytes, i)
    if (brand === BRAND_AVIF || brand === BRAND_AVIS) {
      return true
    }
  }
  return false
}

// Sniffs the ftyp box without copying or scanning the whole file.
function isAVIF (bytes) {
  if (!bytes || bytes.length < COMPAT_OFFSET) {
    return false
  }
  var boxSize = (
    (bytes[0] << 24) |
    (bytes[1] << 16) |
    (bytes[2] << 8) |
    bytes[3]) >>> 0
  if (boxSize < BOX_HEADER_SIZE || boxSize > bytes.length) {
    return false
  }
  if (brandCode(bytes, FTYPE_OFFSET) !== BRAND_FTYP) {
    return false
  }
  return (
    hasAVIFBrand(bytes, BRAND_OFFSET, MINOR_OFFSET) ||
    hasAVIFBrand(bytes, COMPAT_OFFSET, boxSize))
}

// ---------------------------------------------------------------------------
// ffmpeg/ffprobe backend (Node.js only)
// ---------------------------------------------------------------------------
var backendChecked = false
var backend = null

function stdio () {
  return ['pipe', 'pipe', 'pipe']
}

// pulls the decoder's own diagnostics out of a failed child process so
// the raised error stays diagnosable
function diagnostics (e) {
  var stderr = e && e.stderr
  if (stderr) {
    var text = stderr.toString().trim()
    if (text) {
      return text
    }
  }
  return e ? e.message : 'unknown error'
}

function findBackend () {
  if (backendChecked) {
    return backend
  }
  backendChecked = true
  try {
    if (typeof process === 'undefined' ||
        !process.versions ||
        !process.versions.node) {
      return null
    }
    // indirect require: keeps static bundlers (rollup/browserify) from
    // trying to inline a node-only core module into browser builds
    var nodeRequire = typeof module !== 'undefined' && module.require
    if (!nodeRequire) {
      return null
    }
    var childProcess = nodeRequire.call(module, 'child_process')
    if (!childProcess || !childProcess.execFileSync) {
      return null
    }
    var ffmpeg = process.env.REGL_AVIF_FFMPEG || 'ffmpeg'
    var ffprobe = process.env.REGL_AVIF_FFPROBE || 'ffprobe'
    childProcess.execFileSync(ffmpeg, ['-version'], { stdio: 'ignore' })
    childProcess.execFileSync(ffprobe, ['-version'], { stdio: 'ignore' })
    backend = {
      ffmpeg: ffmpeg,
      ffprobe: ffprobe,
      execFileSync: childProcess.execFileSync
    }
  } catch (e) {
    backend = null
  }
  return backend
}

function probeStreams (tools, bytes) {
  var out = tools.execFileSync(tools.ffprobe, [
    '-v', 'error',
    '-show_entries', 'stream=index,codec_type,width,height,pix_fmt',
    '-of', 'json',
    'pipe:0'
  ], {
    input: bytes,
    stdio: stdio(),
    maxBuffer: 16 * 1024 * 1024
  })
  var info
  try {
    info = JSON.parse(out.toString())
  } catch (e) {
    throw new DecodeError(
      'could not parse AVIF stream metadata', DecodeError.FAILED)
  }
  var color = null
  var alpha = null
  var streams = info.streams || []
  for (var i = 0; i < streams.length; ++i) {
    var stream = streams[i]
    if (stream.codec_type !== 'video') {
      continue
    }
    if (/^gray/.test(stream.pix_fmt || '')) {
      alpha = stream
    } else if (!color) {
      color = stream
    }
  }
  if (!color || !(color.width > 0) || !(color.height > 0)) {
    throw new DecodeError(
      'AVIF image does not contain a decodable color stream',
      DecodeError.FAILED)
  }
  return { color: color, alpha: alpha }
}

function decodeFrames (tools, bytes, streams, numBytes) {
  var args
  if (streams.alpha) {
    args = [
      '-v', 'error',
      '-i', 'pipe:0',
      '-filter_complex',
      '[0:v:0]format=rgba[rgb];' +
        '[0:v:1]format=gray[a];' +
        '[rgb][a]alphamerge,format=rgba[out]',
      '-map', '[out]',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      'pipe:1'
    ]
  } else {
    args = [
      '-v', 'error',
      '-i', 'pipe:0',
      '-map', '0:v:0',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      'pipe:1'
    ]
  }
  return tools.execFileSync(tools.ffmpeg, args, {
    input: bytes,
    stdio: stdio(),
    maxBuffer: numBytes + 1024 * 1024
  })
}

function decodeAVIF (bytes) {
  if (!isAVIF(bytes)) {
    throw new DecodeError(
      'input data is not an AVIF image (missing avif ftyp brand)',
      DecodeError.DATA)
  }
  var tools = findBackend()
  if (!tools) {
    throw new DecodeError(
      'no AVIF decoder available: ffmpeg/ffprobe not found',
      DecodeError.UNSUPPORTED)
  }

  var streams
  var pixels
  try {
    streams = probeStreams(tools, bytes)
  } catch (e) {
    if (e instanceof DecodeError) {
      throw e
    }
    throw new DecodeError(
      'failed to read AVIF image metadata: ' + diagnostics(e),
      DecodeError.FAILED)
  }

  var width = streams.color.width | 0
  var height = streams.color.height | 0
  var numBytes = width * height * 4
  try {
    pixels = decodeFrames(tools, bytes, streams, numBytes)
  } catch (e) {
    throw new DecodeError(
      'failed to decode AVIF image data: ' + diagnostics(e),
      DecodeError.FAILED)
  }
  if (!pixels || pixels.length !== numBytes) {
    throw new DecodeError(
      'decoded AVIF pixel data has unexpected size ' +
      (pixels ? pixels.length : 0) + ', expected ' + numBytes,
      DecodeError.FAILED)
  }

  return {
    width: width,
    height: height,
    channels: 4,
    // view onto the decoder output, no extra copy of the pixel data
    data: new Uint8Array(pixels.buffer, pixels.byteOffset, numBytes)
  }
}

module.exports = {
  isAVIF: isAVIF,
  decodeAVIF: decodeAVIF
}
