PWA install icons, generated from the 3D Sports Displays badge
(`~/Desktop/3D Sports Displays/01-Logos/3D Sports Displays-02.png`) via
ImageMagick — see the design notes in the polish-pass PR description for the
exact crop/export commands. `icon-maskable-512.png` pads the badge onto a
512×512 matte-black (`#0d0d0e`) canvas so Android's circular mask doesn't
clip it. Regenerate all three together if the source artwork changes; keep
the filenames and sizes in sync with `public/manifest.json`.
