import os
import subprocess

SRC_IMAGE = 'src/assets/images/app_icon_logo_1788862568445.jpg'
ANDROID_RES = 'android/app/src/main/res'
PUBLIC_DIR = 'public'
ASSETS_PUBLIC_DIR = 'android/app/src/main/assets/public'

# Background color of the icon
BG_COLOR = '#023489'
SPLASH_BG_COLOR = '#F8FAFC'

ANDROID_MIPMAPS = [
    {'name': 'mipmap-mdpi', 'size': 48, 'fgSize': 108},
    {'name': 'mipmap-hdpi', 'size': 72, 'fgSize': 162},
    {'name': 'mipmap-xhdpi', 'size': 96, 'fgSize': 216},
    {'name': 'mipmap-xxhdpi', 'size': 144, 'fgSize': 324},
    {'name': 'mipmap-xxxhdpi', 'size': 192, 'fgSize': 432},
]

SPLASH_SCREENS = [
    ('drawable/splash.png', 480, 320, 100),
    ('drawable-land-mdpi/splash.png', 480, 320, 100),
    ('drawable-land-hdpi/splash.png', 800, 480, 140),
    ('drawable-land-xhdpi/splash.png', 1280, 720, 180),
    ('drawable-land-xxhdpi/splash.png', 1600, 960, 220),
    ('drawable-land-xxxhdpi/splash.png', 1920, 1280, 260),
    ('drawable-port-mdpi/splash.png', 320, 480, 120),
    ('drawable-port-hdpi/splash.png', 480, 800, 160),
    ('drawable-port-xhdpi/splash.png', 720, 1280, 200),
    ('drawable-port-xxhdpi/splash.png', 960, 1600, 260),
    ('drawable-port-xxxhdpi/splash.png', 1280, 1920, 320),
]

def run(cmd):
    subprocess.run(cmd, shell=True, check=True)

def generate():
    print(f'Starting asset generation from {SRC_IMAGE}...')

    # 1. Update ic_launcher_background.xml
    bg_xml_path = os.path.join(ANDROID_RES, 'values', 'ic_launcher_background.xml')
    os.makedirs(os.path.dirname(bg_xml_path), exist_ok=True)
    with open(bg_xml_path, 'w', encoding='utf-8') as f:
        f.write(f'''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">{BG_COLOR}</color>
</resources>
''')
    print('Updated ic_launcher_background.xml with', BG_COLOR)

    # 2. Generate Mipmap icons (Adaptive Foreground + Legacy icons)
    for item in ANDROID_MIPMAPS:
        folder = os.path.join(ANDROID_RES, item['name'])
        os.makedirs(folder, exist_ok=True)
        size = item['size']
        fg_size = item['fgSize']
        radius = int(size * 0.2)
        center = size // 2

        # 2a. Legacy square with rounded corners: ic_launcher.png
        legacy_icon = os.path.join(folder, 'ic_launcher.png')
        run(f'''
            convert {SRC_IMAGE} -resize {size}x{size}^ -gravity center -extent {size}x{size} \
            \\( +clone -alpha extract -draw "fill black polygon 0,0 0,{size} {size},{size} {size},0 fill white roundrectangle 0,0 {size},{size} {radius},{radius}" \\) \
            -alpha off -compose CopyOpacity -composite {legacy_icon}
        ''')

        # 2b. Legacy round icon: ic_launcher_round.png
        legacy_round = os.path.join(folder, 'ic_launcher_round.png')
        run(f'''
            convert {SRC_IMAGE} -resize {size}x{size}^ -gravity center -extent {size}x{size} \
            \\( +clone -alpha extract -draw "fill black polygon 0,0 0,{size} {size},{size} {size},0 fill white circle {center},{center} {center},0" \\) \
            -alpha off -compose CopyOpacity -composite {legacy_round}
        ''')

        # 2c. Adaptive Foreground: ic_launcher_foreground.png
        # Adaptive icon safe area is inner 66% (72dp of 108dp).
        # We scale inner content to ~78% so logo is perfectly within the safe mask.
        inner_size = int(fg_size * 0.78)
        fg_icon = os.path.join(folder, 'ic_launcher_foreground.png')
        run(f'''
            convert -size {fg_size}x{fg_size} "xc:{BG_COLOR}" \
            \\( {SRC_IMAGE} -resize {inner_size}x{inner_size} \\) \
            -gravity center -composite {fg_icon}
        ''')
        print(f'Generated {item["name"]} (legacy: {size}x{size}, fg: {fg_size}x{fg_size})')

    # 3. Generate Web and PWA icons
    web_icons = [
        ('favicon.png', 32),
        ('icon-192.png', 192),
        ('icon-512.png', 512),
        ('icon.png', 512),
    ]
    for filename, s in web_icons:
        # PWA standard: square icon with soft rounded corners (20% radius)
        rad = int(s * 0.18)
        dest = os.path.join(PUBLIC_DIR, filename)
        run(f'''
            convert {SRC_IMAGE} -resize {s}x{s}^ -gravity center -extent {s}x{s} \
            \\( +clone -alpha extract -draw "fill black polygon 0,0 0,{s} {s},{s} {s},0 fill white roundrectangle 0,0 {s},{s} {rad},{rad}" \\) \
            -alpha off -compose CopyOpacity -composite {dest}
        ''')
        print(f'Generated {dest} ({s}x{s})')

        # Mirror to android/app/src/main/assets/public/
        if os.path.exists(ASSETS_PUBLIC_DIR):
            mirror_dest = os.path.join(ASSETS_PUBLIC_DIR, filename)
            run(f'cp {dest} {mirror_dest}')

    # 4. Generate Splash screens
    # Create a clean high-res 512x512 logo with rounded corners for splash composition
    tmp_logo = '/tmp/splash_logo_512.png'
    run(f'''
        convert {SRC_IMAGE} -resize 512x512^ -gravity center -extent 512x512 \
        \\( +clone -alpha extract -draw "fill black polygon 0,0 0,512 512,512 512,0 fill white roundrectangle 0,0 512,512 110,110" \\) \
        -alpha off -compose CopyOpacity -composite {tmp_logo}
    ''')

    for path, w, h, icon_sz in SPLASH_SCREENS:
        full_path = os.path.join(ANDROID_RES, path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        run(f'''
            convert -size {w}x{h} "xc:{SPLASH_BG_COLOR}" \
            \\( {tmp_logo} -resize {icon_sz}x{icon_sz} \\) \
            -gravity center -composite {full_path}
        ''')
        print(f'Generated splash: {path} ({w}x{h}, logo {icon_sz}px)')

    print('\nAll Android icons and splash screens successfully generated!')

if __name__ == '__main__':
    generate()
