/*
  Offscreen verification of the smooth camera path splines.

  Renders the bunny from a camera driven by lib/util/spline through
  example/util/camera-path, using the headless gl context the repo tests use.
  Each frame is dumped as a PNG so ffmpeg can assemble titled segments.
 */

var fs = require('fs')
var path = require('path')
var savePixels = require('save-pixels')
var ndarray = require('ndarray')

var createContext = require('../test/util/create-context')
var createREGL = require('../regl')
var bunny = require('bunny')
var normals = require('angle-normals')
var createCameraPath = require('../example/util/camera-path')

var WIDTH = 480
var HEIGHT = 360
var FRAMES_PER_SEGMENT = 48

var gl = createContext(WIDTH, HEIGHT)
var regl = createREGL(gl)

var keyframes = [
  { eye: [0, 4, 14], center: [0, 1, 0], up: [0, 1, 0] },
  { eye: [11, 3, 6], center: [0, 1, 0], up: [0, 1, 0] },
  { eye: [9, 7, -9], center: [0, 1, 0], up: [0, 1, 0] },
  { eye: [-9, 3, -8], center: [0, 1, 0], up: [0, 1, 0] },
  { eye: [-11, 6, 7], center: [0, 1, 0], up: [0, 1, 0] }
]

var drawBunny = regl({
  vert: [
    'precision mediump float;',
    'attribute vec3 position, normal;',
    'uniform mat4 view, projection;',
    'varying vec3 vnormal;',
    'void main() {',
    '  vnormal = normal;',
    '  gl_Position = projection * view * vec4(position, 1.0);',
    '}'
  ].join('\n'),
  frag: [
    'precision mediump float;',
    'varying vec3 vnormal;',
    'void main() {',
    '  vec3 light = normalize(vec3(0.4, 0.8, 0.6));',
    '  float shade = 0.35 + 0.65 * max(dot(normalize(vnormal), light), 0.0);',
    '  gl_FragColor = vec4(shade * vec3(0.75, 0.85, 1.0), 1.0);',
    '}'
  ].join('\n'),
  attributes: {
    position: bunny.positions,
    normal: normals(bunny.cells, bunny.positions)
  },
  elements: bunny.cells
})

var setupCamera = regl({
  context: {
    view: function (_, props) {
      return require('gl-mat4/lookAt')([], props.eye, props.center, props.up)
    },
    projection: function (context) {
      return require('gl-mat4/perspective')(
        [], Math.PI / 4,
        context.viewportWidth / context.viewportHeight,
        0.1, 100)
    }
  },
  uniforms: {
    view: regl.context('view'),
    projection: regl.context('projection')
  }
})

function dumpFrame (filePath) {
  var pixels = new Uint8Array(WIDTH * HEIGHT * 4)
  gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
  var flipped = new Uint8Array(WIDTH * HEIGHT * 4)
  for (var y = 0; y < HEIGHT; ++y) {
    var srcRow = (HEIGHT - 1 - y) * WIDTH * 4
    flipped.set(pixels.subarray(srcRow, srcRow + WIDTH * 4), y * WIDTH * 4)
  }
  var frame = ndarray(flipped, [HEIGHT, WIDTH, 4])
  savePixels(frame, 'png').pipe(fs.createWriteStream(filePath))
}

var segments = [
  { name: 'linear', type: 'linear', edge: 'clamp' },
  { name: 'catmull-clamp', type: 'catmull-rom', edge: 'clamp' },
  { name: 'catmull-mirror', type: 'catmull-rom', edge: 'mirror' },
  { name: 'b-spline-mirror', type: 'uniform-cubic', edge: 'mirror' },
  { name: 'b-spline-repeat', type: 'uniform-cubic', edge: 'repeat' }
]

var manifest = []
var frameIndex = 0

segments.forEach(function (segment) {
  var cameraPath = createCameraPath(keyframes, {
    type: segment.type,
    edge: segment.edge
  })
  var startFrame = frameIndex
  for (var i = 0; i < FRAMES_PER_SEGMENT; ++i) {
    var t = i / (FRAMES_PER_SEGMENT - 1)
    var state = cameraPath.at(t)
    regl.clear({ color: [0.08, 0.09, 0.12, 1], depth: 1 })
    setupCamera(state, function () {
      drawBunny()
    })
    var fileName = 'frame-' + String(frameIndex).padStart(4, '0') + '.png'
    dumpFrame(path.join(__dirname, 'frames', fileName))
    manifest.push({
      segment: segment.name,
      file: fileName,
      t: t,
      eye: state.eye
    })
    frameIndex += 1
  }
  segment.startFrame = startFrame
  segment.frameCount = FRAMES_PER_SEGMENT
})

process.on('exit', function () {
  fs.writeFileSync(
    path.join(__dirname, 'render-manifest.json'),
    JSON.stringify({ width: WIDTH, height: HEIGHT, segments: segments }, null, 2))
  console.log('rendered ' + frameIndex + ' frames across ' + segments.length + ' segments')
})
