# Homepage craft media verification

Current generated output: `portable/homepage.html`, 5531.1 KiB; all image/script/font assets embedded.

- Node 24.14.0: typecheck passed; 284 tests passed; design-system check passed.
- Lint completed with existing React ref/effect warnings in untouched `src/PdfPage.tsx`.
- Standard build and portable build passed; standard build retains existing large chunk warnings.
- Built HTML audited for unexpanded tokens and external image/script/stylesheet dependencies: passed.
- Browser via local HTTP: 506 checks passed, no errors. Home widths 360/390/768/1024/1440 with all 7 locales; guide/about/features/FAQ/legal routes at 390/1440; image decoding and 4:3 photo proportions; language synchronization, FAQ, menu Escape focus, CTA paths, animation pause/resume and line/count timing.
- Visually inspected desktop/tablet/mobile and saved captures here. Native Space key toggles the playback checkbox.
- Existing homepage behavior and app source were preserved. Actual app screenshot remains in the use guide.
- Reduced-motion CSS uses a static example; OS-level reduced-motion setting was not exercised. Android/iOS physical devices, file-protocol browser loading, display wake-lock behavior, and public deployment were not tested in this pass.

Media prompts/provenance: `homepage/assets/CRAFT_IMAGES.md`. Photos generated with the built-in image_gen tool; six-second feature example implemented in SVG/CSS, not a GIF asset.
