# Archive provenance map

This repository was reconstructed from a **flat archive**: 93 files downloaded
one by one into a single directory, with filenames scrambled against contents.
This table is the permanent record of that decode.

The reconstruction was verified by a SHA-256 multiset bijection between the
archive and this tree. All 93 hashes are distinct and every one matched exactly
once, so nothing was lost, duplicated or truncated.

The original flat archive is preserved outside this repository, under
`Desktop/chatgpt-oldal/Danzsu-Research-Hub`.

`README.md` kept its name and content. `CLAUDE.md` kept its name but was
rewritten after the move, because the old text described the flat archive and
becomes actively misleading once the tree exists.

## Application source

| Archive filename | Destination | SHA-256 (first 12) |
| --- | --- | --- |
| `slider.tsx` | `app/api/state/route.ts` | `ee3c57baa110` |
| `empty.tsx` | `app/archive/page.tsx` | `58a6e380110e` |
| `scroll-area.tsx` | `app/chatgpt-auth.ts` | `4265a2e7c2dc` |
| `dropdown-menu.tsx` | `app/components/digest-dashboard.tsx` | `8586ac343eb1` |
| `direction.tsx` | `app/globals.css` | `a1500a091bfa` |
| `tabs.tsx` | `app/layout.tsx` | `6c0d6ae29eb3` |
| `pagination.tsx` | `app/lib/user.ts` | `89311afba5f1` |
| `radio-group.tsx` | `app/page.tsx` | `24e426e67d3a` |

## Database, schema and migrations

| Archive filename | Destination | SHA-256 (first 12) |
| --- | --- | --- |
| `raw.ts` | `db/index.ts` | `dc7610b00b91` |
| `0000_cool_drax.sql` | `db/raw.ts` | `0ba0aed04260` |
| `index.ts` | `db/schema.ts` | `019367d1ed08` |
| `0001_snapshot.json` | `drizzle/0000_cool_drax.sql` | `b97aa7106324` |
| `use-mobile.ts` | `drizzle/0001_equal_black_panther.sql` | `9e2530e5bd30` |
| `0001_equal_black_panther.sql` | `drizzle/meta/0000_snapshot.json` | `c766c34f9abc` |
| `route.ts` | `drizzle/meta/0001_snapshot.json` | `fa1397773e26` |
| `schema (1).ts` | `drizzle/meta/_journal.json` | `7b1eb68dcbd6` |

## Root configuration

| Archive filename | Destination | SHA-256 (first 12) |
| --- | --- | --- |
| `vite.config.ts` | `.gitignore` | `55d0a3e1f8e2` |
| `hosting.json` | `.npmrc` | `a3909ac0447c` |
| `toggle-group.tsx` | `.openai/hosting.json` | `4bee115e793a` |
| `CLAUDE.md` | `CLAUDE.md` | `a4107eb163d3` |
| `README.md` | `README.md` | `8eb9b40fc706` |
| `page.tsx` | `cloudflare-env.d.ts` | `8b0eca84aa33` |
| `layout.tsx` | `components.json` | `31f4ca67a4a6` |
| `digest-dashboard.tsx` | `drizzle.config.ts` | `af081f7384aa` |
| `globals.css` | `eslint.config.mjs` | `010a29cfff26` |
| `page (3).tsx` | `next-env.d.ts` | `217ce9348b52` |
| `user.ts` | `next.config.ts` | `614bce25b089` |
| `route (4).ts` | `package.json` | `4f6c27902971` |
| `chatgpt-auth.ts` | `pnpm-lock.yaml` | `89dcf13994f9` |
| `sites-vite-plugin.ts` | `pnpm-workspace.yaml` | `a054fd988443` |
| `sites-vite-plugin.LICENSE` | `postcss.config.mjs` | `dfac7ac2d86d` |
| `alert.tsx` | `tsconfig.json` | `199bbec6ee3f` |
| `badge.tsx` | `vite.config.ts` | `4b9d8a6b14fd` |

## Toolchain (scripts/, build/)

| Archive filename | Destination | SHA-256 (first 12) |
| --- | --- | --- |
| `dialog.tsx` | `build/sites-vite-plugin.LICENSE` | `7de1e115d165` |
| `carousel.tsx` | `build/sites-vite-plugin.ts` | `07af20e7097d` |
| `pnpm-workspace.yaml` | `scripts/build-verified.sh` | `2ae5329ac860` |
| `drizzle.config.ts` | `scripts/execution-profile.mjs` | `2e71116f4d2b` |
| `package.json` | `scripts/install-ci.mjs` | `63f2c4589b74` |
| `cloudflare-env.d.ts` | `scripts/install-ci.sh` | `5161648b5101` |
| `next.config.ts` | `scripts/install-pnpm.sh` | `db980d931c7d` |
| `components.json` | `scripts/pnpm-install.mjs` | `380309d06af7` |
| `next-env.d.ts` | `scripts/run-framework.mjs` | `9bf9f41a2931` |
| `eslint.config.mjs` | `scripts/sites-env.mjs` | `5de99d6806b0` |
| `pnpm-lock.yaml` | `scripts/sites-env.sh` | `df86ebfc27d2` |

## Library code, assets, docs, examples

| Archive filename | Destination | SHA-256 (first 12) |
| --- | --- | --- |
| `menubar.tsx` | `docs/vinext-starter-README.md` | `b670ba0eff3b` |
| `install-ci.sh` | `examples/d1/app/api/notes/route.ts` | `a3d4a74fd53b` |
| `execution-profile.mjs` | `examples/d1/db/schema.ts` | `d89eabd95716` |
| `install-pnpm.sh` | `hooks/use-mobile.ts` | `ad0936f84f1d` |
| `install-ci.mjs` | `lib/utils.ts` | `53f3d3d070f0` |
| `shadcn-tailwind-4.13.0.LICENSE.md` | `public/favicon.svg` | `30654ec110f8` |
| `shadcn-tailwind-4.13.0.css` | `public/file.svg` | `1e0ae4d1a1dd` |
| `build-verified.sh` | `public/globe.svg` | `d051a8c47936` |
| `download` | `public/window.svg` | `decf1cf7bb22` |
| `README (2).md` | `vendor/shadcn-tailwind-4.13.0.LICENSE.md` | `1564074e1343` |
| `tsconfig.json` | `vendor/shadcn-tailwind-4.13.0.css` | `bc7d83425702` |

## shadcn/ui components

| Archive filename | Destination | SHA-256 (first 12) |
| --- | --- | --- |
| `separator.tsx` | `components/ui/accordion.tsx` | `a4f153089ba8` |
| `aspect-ratio.tsx` | `components/ui/alert-dialog.tsx` | `9a8d950f2b9b` |
| `label.tsx` | `components/ui/alert.tsx` | `2cc59b5f7bda` |
| `kbd.tsx` | `components/ui/aspect-ratio.tsx` | `b1c157886236` |
| `context-menu.tsx` | `components/ui/badge.tsx` | `46a0de5224f6` |
| `field.tsx` | `components/ui/breadcrumb.tsx` | `d4c0831bba22` |
| `item.tsx` | `components/ui/button.tsx` | `cc36af0f8b50` |
| `sonner.tsx` | `components/ui/calendar.tsx` | `3855fbe0d3f8` |
| `native-select.tsx` | `components/ui/carousel.tsx` | `b7ea0dda3903` |
| `progress.tsx` | `components/ui/chart.tsx` | `45aa5ea4a386` |
| `message.tsx` | `components/ui/checkbox.tsx` | `b23ab9d4deee` |
| `digest.ts` | `components/ui/command.tsx` | `361193df1e3d` |
| `input-otp.tsx` | `components/ui/context-menu.tsx` | `2cf1fcf59df0` |
| `attachment.tsx` | `components/ui/dialog.tsx` | `dce39c6adc47` |
| `select.tsx` | `components/ui/direction.tsx` | `84ae2ad65820` |
| `breadcrumb.tsx` | `components/ui/dropdown-menu.tsx` | `98f0dcdae382` |
| `button.tsx` | `components/ui/empty.tsx` | `ae95bdcf367a` |
| `bubble.tsx` | `components/ui/form.tsx` | `315b46bb75ab` |
| `sidebar.tsx` | `components/ui/hover-card.tsx` | `f5d8df42c593` |
| `spinner.tsx` | `components/ui/input-group.tsx` | `6afbd58fea4c` |
| `textarea.tsx` | `components/ui/input.tsx` | `8c4612a7c413` |
| `avatar.tsx` | `components/ui/label.tsx` | `a476e41f08b9` |
| `button-group.tsx` | `components/ui/marker.tsx` | `3d798763f094` |
| `table.tsx` | `components/ui/menubar.tsx` | `9243af8afcea` |
| `form.tsx` | `components/ui/message-scroller.tsx` | `bb7660a248e4` |
| `skeleton.tsx` | `components/ui/message.tsx` | `9d2952bf3b64` |
| `command.tsx` | `components/ui/pagination.tsx` | `374ad135c3d4` |
| `combobox.tsx` | `components/ui/radio-group.tsx` | `fe5ce39636d0` |
| `hover-card.tsx` | `components/ui/resizable.tsx` | `bc63958467aa` |
| `switch.tsx` | `components/ui/scroll-area.tsx` | `8bd9d986b284` |
| `navigation-menu.tsx` | `components/ui/select.tsx` | `0b796a108a4e` |
| `drawer.tsx` | `components/ui/sheet.tsx` | `63863cf2df8f` |
| `popover.tsx` | `components/ui/slider.tsx` | `0e37484f4b41` |
| `card.tsx` | `components/ui/table.tsx` | `20e5a7f22495` |
| `marker.tsx` | `components/ui/tabs.tsx` | `865d0194331b` |
| `input-group.tsx` | `components/ui/toggle-group.tsx` | `69f643e889e9` |
| `collapsible.tsx` | `components/ui/toggle.tsx` | `ba4d0b0a2b2f` |
| `accordion.tsx` | `components/ui/tooltip.tsx` | `a0784eb77831` |

