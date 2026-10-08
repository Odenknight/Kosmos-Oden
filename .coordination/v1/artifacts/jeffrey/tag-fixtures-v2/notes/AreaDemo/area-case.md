---
title: Area Case Sensitivity Fixture
timestamp: "2026-08-01T00:00:00Z"
tags:
  - area/demo
---
# Area Case

Area is AreaDemo (first segment, spelling preserved). Kosmos qSearch area
filter is case-insensitive equality (agent-server.ts: area.toLowerCase()
comparison), so area=areademo and area=AREADEMO both match this note.
