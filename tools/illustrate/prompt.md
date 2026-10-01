# Illustration prompt

This file is the style. `illustrate.py` builds every request from the
sections below, in this order: `base`, then the subject's kind (`bird` or
`mammal`), then that kind's pose (`bird perched`, `mammal flight`, ...).
A species' entry in `notes.json` is added after them.

Placeholders: `{com_name}` (e.g. `Carolina Wren`) and `{sci_name}`
(e.g. `Thryothorus ludovicianus`). Only text under a `## ` heading is sent;
this introduction is not.

"Perched" and "flight" are the two slots the web UI has: the small,
everywhere picture (`<slug>.png`) and the large hero one (`<slug>-2.png`).
For mammals they mean at rest and in motion.

## base

A Japanese kacho-e (bird-and-flower) woodblock print of a single {com_name} ({sci_name}), in the manner of Ohara Koson's bird prints shown in the attached style plates -- match their technique closely. A fine, thin ink outline that is sometimes dropped where one color meets another; colors printed in soft, flat areas from carved blocks, with gentle gradients and the faint grain of paper and pigment showing through. Very little interior detail: plumage or coat simplified into a few graceful shapes, with just enough fine strokes for the field marks. Natural, harmonious proportions -- elegant, never cartoonish or chunky. Use only the species' own true colors, never adding one it does not have, but print them as rich pigment, softened a little by age: deep and slightly earthy (a blue leans toward indigo-teal, a red toward vermilion-brick), with the whole print carrying a faint warm yellowing of age. Clear contrast: crisp, solid sumi-black accents where the species has black, against the richer mid-tones -- never pastel, washed-out or chalky. Pale plumage is never left as bare paper: whites, greys and pale underparts are printed in warm peach-cream and soft buff, with a cool hint of the bird's main color, blending smoothly into one another with no hard-edged patches, so the whole bird reads as rich, layered color.

The animal is alone on a plain, flat, pale washi-paper ground that fills the entire image edge to edge -- no visible sheet edges, margins or mat. Nothing else is printed unless the pose below asks for it: no branch, twig, perch, blossom, leaves, rock, ground line, water, moon, shadow, frame, border, seal, signature or text, and no pale outline, halo or sticker-like edge around the animal -- its printed edge meets the paper directly. Center it with a generous empty margin on every side; no part of it -- beak, wingtips, tail, toes, ears -- may touch or cross the edge of the image. If style plates are attached, follow their technique only -- never their subject, plants, scenery or lettering.

Show an adult in its most recognizable plumage or coat: for birds, the breeding male unless the species note says otherwise.

## bird

Correct anatomy: one head, one beak, exactly two wings, two legs, one tail. Proportions, markings and colors must match a field guide for {com_name}. Do not invent wing bars, eye rings, crests or face patterns the species does not have, and keep it clearly distinct from similar species.

## bird perched

Pose: perched at rest, wings folded, seen from the side or in three-quarter view, on a short, straight stub of bare twig printed in the same style -- muted brown-grey bark with a fine ink outline, roughly level, only a little longer than the span of the two feet, cut off cleanly at both ends. A single plain straight piece: no forks, side shoots, knots, leaves, buds, blossoms, berries or moss. It is the only thing printed besides the bird. Both feet grip the twig naturally, toes wrapped around it, the legs short and partly hidden by the belly feathers, the feet small and in proportion to the species.

## bird perched ground

Pose: standing at rest on the ground, wings folded, seen from the side or in three-quarter view. The feet stand flat and relaxed, toes spread naturally as the species stands, on a surface that is implied but not printed -- no ground line, grass, water or shadow.

## bird flight

Pose: in flight, both wings fully spread and entirely inside the image, body and tail in a natural flying attitude, legs tucked against the belly or trailing straight back under the tail. Exactly two wings; overlapping feathers must never read as a third wing.

## mammal

Correct anatomy: one head, four legs, one tail. Proportions, markings and colors must match a field guide for {com_name}.

## mammal perched

Pose: at rest, sitting or standing alert, seen from the side or in three-quarter view, feet planted on a surface that is implied but not painted.

## mammal flight

Pose: in motion, mid-stride or mid-leap with the legs extended, the whole body and tail inside the image.
