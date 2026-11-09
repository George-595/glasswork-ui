"""Render the kit's interface sounds (src/sound/assets/*.wav) from earshot's sound bank.

earshot (github.com/Leonxlnx/earshot, MIT) stores its sounds as code: physical synthesis
parameters, not recordings. This script renders the ones the kit uses, sets each one's level,
and writes small mono WAVs. It is an offline step: the app ships only the WAVs, and nothing in
the build or at run time needs earshot or Python.

Run it in a throwaway virtualenv outside the repo, against an earshot checkout at the commit
below. George granted earshot a one-time pass on the 7-day dependency quarantine for the first
render; a re-render needs a version at least 7 days old, or a
new grant:

    python3 -m venv /tmp/es && /tmp/es/bin/pip install numpy==2.3.3 scipy==1.16.2 soundfile==0.13.1 soxr==1.0.0
    git clone https://github.com/Leonxlnx/earshot /tmp/earshot && git -C /tmp/earshot checkout 925ebe5
    /tmp/es/bin/python -I apps/packages/ui/scripts/render-sounds.py /tmp/earshot

The output is deterministic: every take uses the bank entry's own seed.
"""

import os
import sys

import numpy as np

EARSHOT_COMMIT = '925ebe56a1b755e5d354ab642bb8f344440cfa9c'
OUT_SR = 24000
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'sound', 'assets')

# name -> (layers, loudness): each layer is (bank id, start in seconds, knobs); the loudness is the
# take's loudest momentary LUFS. Touches sit lowest, moves a little above them, chimes highest.
SOUNDS = {
    'tick': ([('fit/tick/domino', 0.0, {})], -30.0),
    'toggle-on': ([('toggle/on', 0.0, {})], -28.0),
    'toggle-off': ([('toggle/off', 0.0, {})], -29.0),
    'open': ([('swish/soft', 0.0, {'dur': 0.32})], -30.0),
    'close': ([('swipe/flick', 0.0, {'dur': 0.26})], -31.0),
    'send': ([('whoosh_fast/tight', 0.0, {'dur': 0.36})], -28.0),
    'notify': ([('pro_notify/ding_1930', 0.0, {})], -25.0),
    'success': (
        [
            ('pluck/kalimba_soft', 0.0, {'pitch': 'E5', 'dur': 0.6}),
            ('pluck/kalimba_soft', 0.09, {'pitch': 'A5', 'dur': 0.6}),
        ],
        -25.0,
    ),
    'error': (
        [
            ('pluck/kalimba_soft', 0.0, {'pitch': 'D5', 'dur': 0.5}),
            ('pluck/kalimba_soft', 0.11, {'pitch': 'A4', 'dur': 0.5}),
        ],
        -25.0,
    ),
    'reply': ([('pluck/kalimba_soft', 0.0, {'pitch': 'E5', 'dur': 0.6})], -27.0),
    'approval': ([('pro_notify/ding_2167', 0.0, {})], -25.0),
}


def main(earshot_dir):
    sys.path.insert(0, earshot_dir)
    import soundfile
    import soxr
    from earshot.forge import bank, sfx

    os.makedirs(OUT, exist_ok=True)
    for name, (layers, lufs) in SOUNDS.items():
        takes = []
        for sid, start, knobs in layers:
            y, meta = bank.render(sid, **knobs)
            if not meta['checks']['ok']:
                raise SystemExit(f'{name}: {sid} fails the audit: {meta["checks"]["summary"]}')
            y = y.mean(axis=1) if y.ndim == 2 else y
            takes.append((int(round(start * bank.SR)), y))
        mix = np.zeros(max(at + len(y) for at, y in takes), np.float32)
        for at, y in takes:
            mix[at : at + len(y)] += y
        # the level: shift the loudest momentary loudness to the target
        mix *= 10 ** ((lufs - bank.measure(mix)['lufs_m_max']) / 20)
        # trim to 70 dB under the peak, with a 20 ms fade so the cut cannot click
        live = np.nonzero(np.abs(mix) > np.abs(mix).max() * 10 ** (-70 / 20))[0]
        mix = mix[: live[-1] + 1]
        fade = min(len(mix) // 4, bank.SR // 50)
        mix[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
        check = sfx.check(mix, category=None, sound=name)
        if check['warnings']:
            raise SystemExit(f'{name}: {check["summary"]}')
        out = np.asarray(soxr.resample(mix, bank.SR, OUT_SR), np.float32)
        soundfile.write(os.path.join(OUT, f'{name}.wav'), out, OUT_SR, subtype='PCM_16')
        peak = 20 * np.log10(np.abs(out).max())
        print(f'{name:10s} {len(out) / OUT_SR:.3f} s  peak {peak:6.1f} dBFS  {lufs} LUFS (momentary max)')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: render-sounds.py <earshot checkout>')
    main(sys.argv[1])
