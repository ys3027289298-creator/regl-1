var createContext = require('./util/create-context')
var createREGL = require('../regl')
var tape = require('tape')
var fs = require('fs')
var path = require('path')

var FIXTURES = path.join(__dirname, 'fixtures')
var SIZE = 16
// decoded pixels must stay within this per-channel bound of the
// ground-truth encoder input (measured error is <= 2)
var TOLERANCE = 8

function fixtureBytes (name) {
  return new Uint8Array(
    fs.readFileSync(path.join(FIXTURES, name))).subarray(0)
}

function fixtureTruth (name) {
  return new Uint8Array(fs.readFileSync(path.join(FIXTURES, name)))
}

function makeRenderer (regl) {
  return regl({
    vert: [
      'attribute vec2 position;',
      'void main() {',
      '  gl_Position = vec4(position, 0, 1);',
      '}'
    ].join('\n'),

    frag: [
      'precision highp float;',
      'uniform sampler2D tex;',
      'uniform vec2 shape;',
      'void main() {',
      '  gl_FragColor = texture2D(tex, gl_FragCoord.xy / shape);',
      '}'
    ].join('\n'),

    attributes: {
      position: [0, -4, -4, 4, 4, 4]
    },

    uniforms: {
      shape: regl.prop('shape'),
      tex: regl.prop('texture')
    },

    depth: { enable: false },

    count: 3
  })
}

tape('texture avif', function (t) {
  var gl = createContext(SIZE, SIZE)
  var regl = createREGL({ gl: gl })
  var renderTexture = makeRenderer(regl)

  function checkPixels (texture, expected, name) {
    renderTexture({ texture: texture, shape: [SIZE, SIZE] })
    t.equals(gl.getError(), 0, name + ': error code is ok')
    var actual = regl.read()
    var maxDiff = 0
    for (var i = 0; i < expected.length; ++i) {
      var diff = Math.abs(actual[i] - expected[i])
      if (diff > maxDiff) {
        maxDiff = diff
      }
    }
    t.ok(maxDiff <= TOLERANCE,
      name + ': per-pixel error bounded (max diff ' + maxDiff +
      ' <= ' + TOLERANCE + ')')
  }

  function checkAlpha (texture, expected, name) {
    renderTexture({ texture: texture, shape: [SIZE, SIZE] })
    var actual = regl.read()
    var maxDiff = 0
    for (var i = 3; i < expected.length; i += 4) {
      var diff = Math.abs(actual[i] - expected[i])
      if (diff > maxDiff) {
        maxDiff = diff
      }
    }
    t.ok(maxDiff <= TOLERANCE,
      name + ': alpha error bounded (max diff ' + maxDiff + ')')
  }

  // --- decode equivalence: color + alpha ---------------------------
  var rgbaBytes = fixtureBytes('pattern-rgba.avif')
  var rgbaTruth = fixtureTruth('pattern-rgba.rgba')
  var rgbaTexture = regl.texture({ data: rgbaBytes, decode: 'avif' })
  t.equals(rgbaTexture.width, SIZE, 'rgba texture width')
  t.equals(rgbaTexture.height, SIZE, 'rgba texture height')
  t.equals(rgbaTexture.format, 'rgba', 'rgba texture format')
  t.equals(rgbaTexture.type, 'uint8', 'rgba texture type')
  checkPixels(rgbaTexture, rgbaTruth, 'avif rgba decode')
  checkAlpha(rgbaTexture, rgbaTruth, 'avif rgba decode')

  // --- opaque images decode with alpha = 255 -----------------------
  var rgbBytes = fixtureBytes('pattern-rgb.avif')
  var rgbTruth = fixtureTruth('pattern-rgb.rgba')
  var rgbTexture = regl.texture({ data: rgbBytes, decode: 'avif' })
  checkPixels(rgbTexture, rgbTruth, 'avif rgb decode')
  checkAlpha(rgbTexture, rgbTruth, 'avif rgb decode')

  // --- accepts ArrayBuffer without copying -------------------------
  var arrayBuffer = rgbaBytes.buffer.slice(
    rgbaBytes.byteOffset, rgbaBytes.byteOffset + rgbaBytes.byteLength)
  var fromBuffer = regl.texture({ data: arrayBuffer, decode: 'avif' })
  checkPixels(fromBuffer, rgbaTruth, 'avif decode from ArrayBuffer')

  // --- accepts a view into a larger buffer (offset handling) -------
  var padded = new Uint8Array(rgbaBytes.length + 32)
  padded.set(rgbaBytes, 13)
  var view = padded.subarray(13, 13 + rgbaBytes.length)
  var fromView = regl.texture({ data: view, decode: 'avif' })
  checkPixels(fromView, rgbaTruth, 'avif decode from offset view')

  // --- subimage goes through the same decode path ------------------
  var subTexture = regl.texture(SIZE, SIZE)
  subTexture.subimage({ data: rgbaBytes, decode: 'avif' }, 0, 0)
  checkPixels(subTexture, rgbaTruth, 'avif decode via subimage')

  // --- distinguishable errors, not generic exceptions --------------
  function checkDecodeError (desc, code, name) {
    var thrown = null
    try {
      regl.texture(desc)
    } catch (e) {
      thrown = e
    }
    t.ok(thrown instanceof Error, name + ': throws an Error')
    t.equals(thrown && thrown.name, 'TextureDecodeError',
      name + ': error is a TextureDecodeError')
    t.equals(thrown && thrown.code, code,
      name + ': error code is ' + code)
  }

  var notAVIF = new Uint8Array(64)
  for (var i = 0; i < notAVIF.length; ++i) {
    notAVIF[i] = (i * 37) & 0xFF
  }
  checkDecodeError(
    { data: notAVIF, decode: 'avif' },
    'ERR_TEXTURE_DECODE_DATA',
    'non-avif bytes')

  checkDecodeError(
    { data: rgbaBytes.subarray(0, 64), decode: 'avif' },
    'ERR_TEXTURE_DECODE_FAILED',
    'truncated avif')

  checkDecodeError(
    { data: rgbaBytes, decode: 'not-a-format' },
    'ERR_TEXTURE_DECODE_FORMAT',
    'unknown decode format')

  checkDecodeError(
    { decode: 'avif' },
    'ERR_TEXTURE_DECODE_DATA',
    'missing data')

  // --- failed decode releases textures and buffers -----------------
  var textureCount = regl.stats.textureCount
  var cubeCount = regl.stats.cubeCount

  t.throws(function () {
    regl.texture({ data: notAVIF, decode: 'avif' })
  }, undefined, 'failed 2d decode throws')
  t.equals(regl.stats.textureCount, textureCount,
    'failed 2d decode does not leak a texture')

  t.throws(function () {
    regl.cube({ data: notAVIF, decode: 'avif' })
  }, undefined, 'failed cube decode throws')
  t.equals(regl.stats.cubeCount, cubeCount,
    'failed cube decode does not leak a texture')
  t.equals(regl.stats.textureCount, textureCount,
    'failed cube decode does not corrupt texture stats')

  // context still fully usable after failures
  var recovered = regl.texture({ data: rgbaBytes, decode: 'avif' })
  t.equals(regl.stats.textureCount, textureCount + 1,
    'texture creation still works after failure')
  checkPixels(recovered, rgbaTruth, 'avif decode after failure')
  recovered.destroy()
  t.equals(regl.stats.textureCount, textureCount,
    'destroy releases the texture')

  // --- existing raw pixel path is untouched ------------------------
  var rawTexture = regl.texture({
    width: SIZE,
    height: SIZE,
    data: rgbaTruth,
    format: 'rgba'
  })
  checkPixels(rawTexture, rgbaTruth, 'raw uint8 pixels unchanged')

  rgbaTexture.destroy()
  rgbTexture.destroy()
  fromBuffer.destroy()
  fromView.destroy()
  subTexture.destroy()
  rawTexture.destroy()

  createContext.destroy(gl)
  t.end()
})
