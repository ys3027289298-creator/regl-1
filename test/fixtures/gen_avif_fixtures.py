# Regenerates the AVIF texture test fixtures.
#
# Requires: pip install pillow-avif-plugin
#
# For every fixture a `.rgba` ground-truth file (raw RGBA8, row-major,
# top row first) is written next to the `.avif` so tests can compare
# decoded pixels against the exact encoder input.
import os

from PIL import Image
import pillow_avif  # noqa: F401  (registers the AVIF plugin)

HERE = os.path.dirname(os.path.abspath(__file__))
SIZE = 16


def pattern(x, y):
    return (x * 16, y * 16, (x + y) * 8, 255 - x * 8)


def write_fixture(name, with_alpha):
    mode = 'RGBA' if with_alpha else 'RGB'
    image = Image.new(mode, (SIZE, SIZE))
    pixels = image.load()
    raw = bytearray()
    for y in range(SIZE):
        for x in range(SIZE):
            r, g, b, a = pattern(x, y)
            pixels[x, y] = (r, g, b, a) if with_alpha else (r, g, b)
            raw += bytes((r, g, b, a if with_alpha else 255))
    image.save(
        os.path.join(HERE, name + '.avif'),
        quality=100,
        subsampling='4:4:4')
    with open(os.path.join(HERE, name + '.rgba'), 'wb') as fout:
        fout.write(bytes(raw))
    print('wrote', name)


if __name__ == '__main__':
    write_fixture('pattern-rgba', True)
    write_fixture('pattern-rgb', False)
