# Homepage craft images

Generated with the built-in `image_gen` tool for KnitPeek. These are staged promotional images, not photographs of a customer or the actual app. No reference images were supplied. The original PNGs remain in the Codex generated_images folder; the website uses WebP exports at quality 86 with unchanged dimensions and composition.

Shared prompt:

> Use case: photorealistic-natural. Website photography for KnitPeek knitting pattern tool. One single high-quality editorial photograph, not collage, no text/logos/watermarks, natural side daylight, neutral white tabletop, fresh medium forest-green wool yarn, ivory accents. Tangible realistic wool texture and mechanically plausible knitting. Calm minimal composition, no decorative plants, no laptop, no UI.

Each request appended the following scene:

## knitting-hands.webp

Portrait 4:5 photograph close view of exactly two human hands actively hand-knitting a forest-green stockinette panel on two slim wooden knitting needles. Correct anatomy five fingers each, connected live loops along the needle, working yarn leads to a single green ball partly visible behind. Frame wrists and hands only no face; panel flows toward bottom. Hero image with crisp hand and stitch detail.

Original: `exec-ca7e27e6-f8bd-4a4d-ae1c-ca64257a1741.png`. Used in hero and step 2, with CSS landscape cropping in the latter.

## pattern-and-knitting.webp

Landscape 4:3 overhead photograph of a simple original paper knitting chart beside a partly knitted forest-green panel, two wooden needles and one ball of matching yarn. Paper chart has a very simple neat grid of small black stitch symbols only, no letters or numbers or branded content. A single hand holds the paper edge ready to bring the pattern into a workspace. White tabletop, generous breathing room, realistic physically coherent stitches.

Original: `exec-a8543643-17a2-42af-9657-bda5e78e24dd.png`. Used in step 1. The generated chart is decorative and is not a knitting instruction.

## knitting-pause.webp

Landscape 4:3 photograph of a quiet paused knitting workspace. A neatly folded partly knitted forest-green stockinette panel with its live stitches securely resting on a wooden needle, matching yarn ball beside it. A small blank ivory note card lies nearby. No hands, no finished garment, conveys safely pausing and returning to the same piece, natural white worktable with subtle soft shadows.

Original: `exec-beb103db-f0f2-4877-9a90-f6aabeb22d21.png`. Used in step 3 and the work-record section.

## finished-knit.webp

Landscape 4:3 editorial product photograph of a finished forest-green knitted scarf folded in a neat soft stack with ribbed edges and fine stockinette texture, matching yarn ball and a pair of wooden knitting needles placed neatly at its side, white tabletop. No hands. Tactile craft finish, restrained minimal aesthetic consistent with the green work-in-progress photographs.

Original: `exec-0034784c-0649-4e61-87da-fae4e59d9a9f.png`. Used beside the final CTA.

## Motion

The feature demo is a code-native, illustrative SVG chart with CSS animation, not an app recording. One 6-second loop advances the counter 24→25 and the connected line one row, then resets both together. A native checkbox pauses/resumes it; reduced-motion disables animation and hides the motion control. It contains no external requests and no video decoding.
