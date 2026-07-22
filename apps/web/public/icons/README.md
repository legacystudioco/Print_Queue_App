PWA install icons, generated from the official 3D Sports Displays badge
artwork (dropped directly into these filenames — see `apps/web/public/icons/icon-512.png`
as the master, 2134×2134 before resizing) via ImageMagick. `icon-maskable-512.png`
pads the badge onto a 512×512 canvas matching the artwork's own background
(`#171717`) so Android's circular safe-zone mask doesn't clip it — the
badge occupies ~74% of the frame. Regenerate all three together if the
source artwork changes; keep the filenames and sizes in sync with
`public/manifest.json`. `apps/web/src/app/icon.png` / `apple-icon.png`
(180×180) and `apps/web/public/logo/mark.png` (the navbar/login "3D"
monogram crop) come from the same source.
