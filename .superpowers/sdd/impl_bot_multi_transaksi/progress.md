# SDD ledger — plan: Finance-FE/implementation_bot_multi_transaksi_ux.md

## Selection (token-constrained): 9 core tasks
Order (per plan §14): 1, 12, 2, 3, 4, 6, 7, 8, 9
Deferred: 5 (caption), 10 (live UX), 11 (new cmds + auto-reply), 13 (prefs), 14 (local-resolver), 15 (cache), 16 (latency), 17 (rich cmds)

Ruling: run LEAN SDD — feature branch not worktree; 1 implementer subagent/task (model sonnet, plan carries full code); controller does inline diff review instead of a separate task-reviewer subagent; final gate = tsc+vitest+lint by controller. Reason: explicit token budget. Cost if wrong: a missed defect ships to the branch (recoverable, branch not merged).
Ruling: no fresh cross-task conflict scan — plan §9 + §15 self-review already tabulated interface consistency & dependency order; ModelSpec/ModelHealth/BotPrefs/LocalMatch verified identical across sections this session. Cost if wrong: an interface mismatch surfaces mid-task as a compile error (cheap to catch).

BASE at branch start: b07bde8

Task 1: dispatched (implementer, sonnet) — BASE b07bde8 — brief task-1-brief.md
Task 1: complete (commits b07bde8..ad68dcd, review clean — inline). 16 new tests, bot suite 162 green, tsc 0, lint clean. Concerns cosmetic (prettier/CRLF, pre-existing repo-wide) — accepted.
Task 12: dispatched (implementer, sonnet) — BASE ad68dcd
  Ruling: Task 12 rewires ONLY receipt-extraction.ts, NOT parse-batch.ts (does not exist yet). parse-batch.ts is created in Task 4 already using generateWithRouter. Cost if wrong: Task 4 subagent edits parse-batch once more (cheap).
Task 12: complete (commits ad68dcd..f7b0471, review clean — inline). gemini-router.ts (11 tests), receipt-extraction rewired to generateWithRouter (vision/text tiers), core.ts configureRouterIO idempotent first-line (circular-import route). Full suite 395 green, tsc 0, lint clean.
  Concern accepted: DEFAULT_ROSTER ids provisional (no live key to run list-gemini-models.mjs); env overrides GEMINI_MODELS_VISION/TEXT exist; comment flags it. Verify before prod.
  Note: 4 tests on deleted internals (withRetry/generateWithModels/MODELS) removed — replaced by router; tier tests added.
Task 2: dispatched (implementer, sonnet) — BASE f7b0471 — brief task-2-brief.md (pure draft-batch model, §4 types)
Task 2: complete (commits f7b0471..09b6fd2, review clean — inline). draft.ts 7 exports (20 tests), types.ts +4 §4 types verbatim. Suite 415 green, tsc 0, lint clean. Concern trivial (brief prose "18" vs 20 it() blocks — wrote block verbatim, all green).
Task 3: dispatched (implementer, sonnet) — BASE 09b6fd2 — brief task-3-brief.md (pure review-command parser + reviewToken)
Task 3: complete (commits 09b6fd2..e8b4279, review clean — inline). review-commands.ts (parseReviewCommand/reviewToken/REVIEW_TOKEN_PREFIX, 20 tests), ReviewCommand+focus in types.ts. Suite 435 green, tsc 0, lint clean. No concerns.
Task 4: dispatched (implementer, sonnet) — BASE e8b4279 — brief task-4-brief.md (parse-batch.ts: multi-tx text parse)
  Ruling: parse-batch.ts MUST use generateWithRouter('text', ...) from Task 12, NOT a raw GoogleGenAI client / const MODEL as the brief code shows. Task 12 centralized model choice. Cost if wrong: parse-batch bypasses the quota router → defeats R12 for the text path.
Task 4: complete (commits e8b4279..c4617e3, review clean — inline). parse-batch.ts routed through generateWithRouter('text') per ruling; parseTransactionBatch never throws. 9 tests, suite 444 green, tsc 0, lint clean. No concerns.
Task 6: dispatched (implementer, sonnet) — BASE c4617e3 — brief task-6-brief.md (admin-data: batch write, tz, last-batch memory, BotPendingDraft widening)
  Ruling: keep 'category_confirm' IN KNOWN_PENDING_KINDS for now (Task 8 removes it together with the legacy handlePendingReply path). The brief test "drops an unknown pendingKind" must use a fabricated kind (e.g. 'bogus_v0'), NOT category_confirm — else core.ts (not yet rewired) breaks its own tests. Cost if wrong: a legacy category_confirm draft survives one extra deploy; 15-min TTL bounds it.
Task 6: FAILED to start — subagent hit account session rate-limit (HTTP 429, claude-sonnet-5), resets 12:30pm Asia/Jakarta. No commit, no working-tree change, no report. HEAD still c4617e3 (Task 4). State clean.
RESUME POINT: dispatch Task 6 fresh (brief task-6-brief.md, BASE c4617e3). Ruling for Task 6 already recorded above (keep category_confirm in KNOWN_PENDING_KINDS; fabricated-kind test). Then Tasks 7, 8, 9 remain.
Committed & green through Task 4: 1(ad68dcd) 12(f7b0471) 2(09b6fd2) 3(e8b4279) 4(c4617e3). Suite 444, tsc 0, lint clean.
Task 6: complete (commits c4617e3..5d1bd59, review clean — inline). admin-data.ts: createTransactionsBatch/deleteTransactions/getUserTimezone/last-batch memory (28 tests, 10 new); BotPendingDraft widened. Suite 455 green, tsc 0, lint clean.
  Accepted scope creep: core.ts +7-line guard in handlePendingReply for transaction_batch kind (type widening broke narrowing; tsc-forced). Task 8 replaces it.
  Accepted: commit-msg middle paragraph prose stale vs KNOWN_PENDING_KINDS ruling (category_confirm kept). Cosmetic.
Task 7: dispatched (implementer, sonnet) — BASE 5d1bd59 — brief task-7-brief.md (replies.ts: structured review card + timestamped confirmations)
  Ruling: Task 7 also updates the ONE core.ts caller of transactionRecorded (core.ts:531, finalizeTransaction) to the new 5-arg form — add `const tz = await adminData.getUserTimezone(userId)` + `new Date(draft.dateIso)`. Also update replies.test.ts:77-78 calls. Task 9 removes finalizeTransaction. Cost if wrong: one extra tz read per legacy single-tx confirm until Task 9.
Task 7: complete (commits 5d1bd59..57b67f5, review clean — inline). replies.ts +10 review/batch replies + timestamped transactionRecorded (49 tests). core.ts:531 updated to 5-arg form per ruling; core.test.ts getUserTimezone stub. Suite 473 green, tsc 0, lint clean.
  Deferred minor: renderLine hides quantity when ×1 (brief guard qty>1) though §5 depicts "×1". Cosmetic; final review may pick up.
  Accepted: local idr() helper in replies.ts normalizes Intl non-breaking space; format.ts untouched.
Task 8: dispatched (implementer, sonnet) — BASE 57b67f5 — brief task-8-brief.md (flow-review.ts editable loop + core.ts dispatch)
  Ruling: Task 8 does NOT touch KNOWN_PENDING_KINDS and does NOT narrow handlePendingReply away from category_confirm. core.ts still WRITES category_confirm (resolveCategoryOrAsk) until Task 9 removes that path. Task 8 core.ts change = ONLY swap the Task-6 temp transaction_batch drop-guard for the real handleReviewMessage dispatch (+ read-command-mid-review handling per brief Step 5). Cost if wrong: category_confirm drafts dropped between Task 8 and 9, breaking legacy single-tx confirm.
Task 8: complete (commits 57b67f5..b74d527, review clean — inline). flow-review.ts editable loop (18 tests); core.ts dispatches transaction_batch to handleReviewMessage + read-command-mid-review handling. KNOWN_PENDING_KINDS + category_confirm/goal branches untouched per ruling. Suite 491 green, tsc 0, lint clean.
Task 9: dispatched (implementer, sonnet) — BASE b74d527 — brief task-9-brief.md (flow-write.ts: text/photo -> batch, commitDirect; core.ts slimmed to dispatcher)
  Ruling: Task 9 NOW removes the legacy category_confirm path fully — delete resolveCategoryOrAsk/finalizeTransaction/handleText/handleImage/rankCandidateCategories/candidateConfidence/base64ToBlob/interface Draft/AUTO_ACCEPT_CONFIDENCE from core.ts; remove category_confirm from KNOWN_PENDING_KINDS (admin-data.ts) + CategoryConfirmDraft type + the branch in handlePendingReply (narrow to GoalContributionDraft); drop core.test.ts photo + single-tx-confirm describe blocks. All ONE commit so suite stays green. This is the plan-sanctioned "Tasks 7-9 ship together" convergence.
Task 9: complete (commits b74d527..723cf40, review clean — inline). flow-write.ts (handleTextTransaction/handlePhoto, 15 tests); core.ts slimmed -302 net to a dispatcher; category_confirm removed fully (admin-data + core + tests) in one commit. Suite 494 green, tsc 0, lint clean, route tests 21/21.
  Deferred: brief test 16 (caption 5th arg) dropped — extractReceipt is still 4-arg (caption context = deferred Task 5). commit-msg "caption rides along as extraction context" overstates; only fallback description uses caption now.

FINAL GATE (controller-run): tsc exit 0; vitest 494 passed / 32 files / 0 fail; next lint clean.
ALL 9 SELECTED TASKS COMPLETE. Branch feat/bot-multi-transaksi, 9 commits ad68dcd..723cf40. NOT merged (merge = stop-and-ask).

DEFERRED TASKS (token-constrained selection, not implemented): 5 caption-context, 10 live-UX, 11 new-cmds+kill-auto-reply, 13 prefs, 14 local-resolver+learning, 15 cache, 16 latency/placeholder, 17 rich-cmds.
OPS TODO carried from plan: (a) run scripts/list-gemini-models.mjs with real GEMINI_API_KEY, verify/fix DEFAULT_ROSTER ids in gemini-router.ts; (b) WHATSAPP_AUTO_REPLY="" in go-whatsapp .env still NOT done (was Task 11); (c) bot_meta/geminiHealth is a new single doc the router writes — no TTL needed.

## RESUME after "Continue" — token budget healthy; proceeding with deferred tasks in dep order: 13, 5, 10, 11, 14, 15, 16, 17.
Ruling: "Continue" post all-9-done + ~15M tokens left = do the deferred tasks. Cost if wrong: extra useful commits on unmerged branch (discardable).
Task 13: dispatched (implementer, sonnet) — BASE 723cf40 — brief task-13-brief.md (BotPrefs + /mode /atur)
Task 13: complete (commits 723cf40..72d2bc1, review clean — inline). prefs-commands.ts (parsePrefsCommand, 7 tests), BotPrefs/DEFAULT_BOT_PREFS, getBotPrefs/saveBotPrefs, /mode /atur wired in core.ts dispatchText. Suite 501 green, tsc 0, lint clean. No concerns.
Task 5: dispatched (implementer, sonnet) — BASE 72d2bc1 — brief task-5-brief.md (caption -> extractReceipt userNote 5th arg, both prompts)
  Ruling: Task 5 ALSO updates flow-write.ts handlePhoto to pass msg.caption as the 5th arg to extractReceipt (Task 9 dropped it to 4 while caption was deferred), and restores the flow-write.test.ts assertion "passes the caption to the extractor" (extractReceipt.mock.calls[0][4] === caption). Cost if wrong: caption reaches extractor but flow-write test gap.
Task 5: complete (commits 72d2bc1..76aab78, review clean — inline). userNoteBlock + MAX_USER_NOTE_CHARS=500, threaded into vision extraction + text mapping prompts; extractReceipt 5th optional arg; flow-write handlePhoto passes msg.caption. Suite 507 green, tsc 0, lint clean. No concerns.
Task 10: dispatched (implementer, sonnet) — BASE 76aab78 — brief task-10-brief.md (live UX: typing indicator, 👀/✅ reactions, Telegram command menu script)
Task 10: complete (commits 76aab78..fd4e86d, review clean — inline). WA+TG routes: 👀 reaction + typing indicator before work, ✅ after reply, typing stop in finally; every ack swallows own error. scripts/register-telegram-commands.mjs created (not run). Suite 512 green, tsc 0, lint clean. Accepted: 2 WA test assertions adapted to .find(/send/message) (👀 now fires first, backward-compatible).
Task 11: dispatched (implementer, sonnet) — BASE fd4e86d — brief task-11-brief.md (SCOPED to Finance-FE: /hariini /minggu /cari /undo /statistik + queries + replies + /help + BOT_SETUP_CHECKLIST.md)
  Ruling: Task 11 does Finance-FE parts ONLY. The go-whatsapp-web-multidevice/src/.env WHATSAPP_AUTO_REPLY="" line + its context.md note = controller handles separately (cross-repo, one-liner, no docker). Do NOT run docker compose.
Controller side-step: go-whatsapp-web-multidevice/src/.env WHATSAPP_AUTO_REPLY="" set (file is gitignored — no commit; deployment reads it directly). User must `docker compose up -d` to apply (ops).
Deferred doc nicety: context.md phone-param note in both repos — skipped (cosmetic; ops-todo already lists the phone param).
Task 11: complete (commits fd4e86d..8d23b0e, review clean — inline). /hariini /minggu /cari /undo /statistik + getTransactionsBetween/searchTransactions + 7 replies + tzOffsetMs (user-local midnight). Suite 521 green (+9), tsc 0, lint clean.
  Accepted: idr() vs formatIDR() (codebase-consistent). BOT_SETUP_CHECKLIST.md edited on disk, gitignored (BOT_*.md) — not in commit, like .superpowers/. Deferred minor: 2 new admin-data query wrappers untested (brief scope; siblings also untested).
Task 14: dispatched (implementer, sonnet) — BASE 8d23b0e — brief task-14-brief.md (local-resolver.ts zero-model L0 + learning loop; connects existing scan-hints.ts)
  Emphasis: splitSegments MUST use lookaround around the separator so "1,5jt" is never split (decimal). tryLocalBatch is all-or-nothing. flow-write reads getBotPrefs (Task 13) + getScanHints; handlePhoto passes real hints not []. flow-review writes hint on commit (failure never costs the user their tx).

Task 14: prior dispatch KILLED by session restart — nothing landed (HEAD still 8d23b0e, tree clean, no local-resolver.ts). Re-dispatching fresh.
Task 14: complete (commits 8d23b0e..9281c33, review clean — inline). local-resolver.ts (L0 zero-model, splitSegments lookaround verbatim, all-or-nothing tryLocalBatch); flow-write L0-before-L1 + reads getScanHints/getBotPrefs; flow-review writes hints on commit (never rethrows). Suite 546 green (+25), tsc 0, lint clean.
  Accepted: "makan siang 35rb" now L0-commits via category-name literal match (was L1). Intended; fast-path tests green.
Task 15: dispatched (implementer, sonnet) — BASE 9281c33 — brief task-15-brief.md (cache.ts hash-keyed model-result cache; flow-write cache checks)
Task 15: complete (commits 9281c33..a6fe5fe, review clean — inline). cache.ts (hashImage/hashParse[text+sorted-category-set]/stripForCache); flow-write L0.5 parse cache + receipt cache before extractReceipt; failures never cached. Suite 556 green (+10), tsc 0, lint clean.
  Ops-todo += Firestore TTL policy on expiresAt for users/{uid}/bot_receipt_cache + bot_parse_cache (like bot_processed_messages). Deferred minor: cached-receipt path still re-runs uploadReceiptForUser on retry (Task 16 territory).
Task 16: dispatched (implementer, sonnet) — BASE a6fe5fe — brief task-16-brief.md (parallel readReceipt||upload + placeholder-then-edit on both routes)
Task 16: complete (commits a6fe5fe..ff5ace7, review clean — inline). flow-write readReceipt() wrapper + Promise.all(read||upload); WA+TG routes send receiptReceived() placeholder for photos then editMessage in place (GOWA /message/:id/update; edit-refused -> fresh send). Suite 561 green (+5), tsc 0, lint clean.
  Deferred minor: WA processMessage catch sends error as fresh msg, stale placeholder stays above. GOWA send-message response shape (results.message_id) from brief not observed live — ops verify.
Task 17: dispatched (implementer, sonnet) — BASE ff5ace7 — brief task-17-brief.md (render.ts + command-args.ts + rich argument commands: /ringkasan agustus, /saldo kebutuhan, /kategori <nama>, /riwayat N kata, /export N)
Task 17: complete (commits ff5ace7..7c338fd, review clean — inline). render.ts + command-args.ts + handleCommandWithArgs (/ringkasan agustus, /saldo kebutuhan, /kategori makan, /riwayat N kata, /export N via BotReply.document + route sendDocument); replies summary/balance enriched. Suite 590 green (+29), tsc 0, lint clean.
  Decisions: command-args regex fixed to match brief tests (slash=>cmd; no-slash=>single all-letters word). stats->statsRich (one reply). /cari single-path. quickHealth uses real financialHealthScore, EF/DTI passed 0 (ponytail-commented). getCategoryItems skipped (unused). /target <nama> omitted (out of scope, no regression).

FINAL GATE (controller): tsc 0; vitest 590 passed / 37 files; next lint clean. 17 commits ad68dcd..7c338fd, +5669 -795 / 43 files.
ALL 17 TASKS COMPLETE. Dispatching final whole-branch review (sonnet).

DEFERRED MINORS for final review to triage:
- T7 renderLine hides quantity when x1 (vs §5). cosmetic.
- T9 caption commit-msg prose overstates (fixed in T5 anyway).
- T11 2 new admin-data query wrappers untested; BOT_SETUP_CHECKLIST.md gitignored (edits on disk only).
- T15 cached-receipt path re-runs uploadReceiptForUser on retry (T16 parallelized but did not dedupe). Firestore TTL policy needed on bot_receipt_cache/bot_parse_cache expiresAt.
- T16 WA processMessage catch sends error as fresh msg, stale placeholder bubble stays above. GOWA send-message/send-file response shapes taken from brief, not observed live.
- T12 DEFAULT_ROSTER model ids provisional (list-gemini-models.mjs not run — no key).
Final whole-branch review: subagent BLOCKED by account session rate-limit (429, resets 2am Asia/Jakarta). Controller ran a proportionate spot-check of the critical seams instead:
  - money never from model number: buildLinesFromParsed re-parses amountText via parseAmount, drops null/<=0 — OK
  - splitSegments never splits inside a number: 18/18 tests incl "1,5jt" — OK
  - batchToDTOs: type=line.type (transfer survives), filters categoryId===null — OK
  - commit(): category-blocking guard, month-lock per distinct month in batch, createTransactionsBatch->rememberLastBatch->clearPending — OK
  - confirm-before-write holds except the deliberate single-line high-confidence text fast-path (L0 single + !alwaysReview; L1 isFastPath + conf>=prefs.autoAcceptConfidence + !alwaysReview) — OK
  Full broad review (router edge cases, integration nits) still owed — user resumes with "Continue" after 2am for it, OR merges on the inline reviews + this spot-check.

PLAN COMPLETE: 17/17 tasks, 17 commits ad68dcd..7c338fd, tsc 0 / 590 tests / lint clean. Branch feat/bot-multi-transaksi NOT merged.

RESUME: retried final whole-branch review (sonnet, running). Controller side-steps done:
  - context.md phone-param note: go-whatsapp-web-multidevice committed (4c8b591); Finance-FE/context.md gitignored → edited on disk only.
  - Remaining ops TODO all need creds/console the controller lacks: list-gemini-models.mjs (GEMINI_API_KEY), docker compose up, Firestore TTL policies (GCP console), register-telegram-commands.mjs (bot token).
PLAN: on final-review return → ONE fix subagent for {review findings + 3 code deferred-minors: card ×1, 2 admin-data query tests, WA stale-placeholder-on-error} → one scoped re-review. Park: /target <nama> (scope), provisional roster ids (no key), gitignored BOT_SETUP_CHECKLIST.
FINAL REVIEW returned: 1 critical / 2 important / 6 minor. Report at reports/final-review.md.
  C1 splitSegments — comma after a digit ("kopi 20000, teh 5000") never splits (lookaround blocks it) → L0 merges to 1 line → auto-commit drops every tx after the first. SILENT DATA LOSS.
  I1 handleTextTransaction lost the pre-model parseAmount guard → "halo" burns an L1 call.
  I2 /undo (handleUndo) deletes without the isBudgetClosedAdmin check that commit() has → can delete from a closed month.
  Deferred triage: T12 provisional ids + T15 cache-hit re-uploads to Drive on re-send → fix before merge; rest defer.
Fix wave dispatched (implementer, sonnet) — BASE 7c338fd — items: C1, I1, I2, T15 upload-cache, + WA stale-placeholder-on-error, card ×1 for receipt lines, 2 admin-data query-wrapper tests.
  Park: /target <nama> (scope creep, no regression); provisional roster ids (router rotates past a 404 via noteFailure — env override + comment; user runs list-gemini-models.mjs with a key); BOT_SETUP_CHECKLIST.md (gitignored).
FIX WAVE complete (commit 57ee303). All 7 items ADDRESSED (controller-verified against each finding + full suite):
  C1 splitSegments regex → splits unless a digit sits on BOTH sides (21 tests, +3). I1 pre-L1 parseAmount guard restored. I2 handleUndo month-lock via new getTransactionsByIds (documentId in, chunked 10). T15 bot_receipt_cache stores {gDriveFileId,gDriveWebViewLink}; cache hit skips re-upload. +WA placeholder edited-on-error, ×1 shown for quantity!=null, 2 admin-data wrapper tests.
  Suite 604 green, tsc 0, lint clean. Skipped separate re-review subagent (token-conscious; each fix verified vs its finding + suite green). Controller adjudication: all ADDRESSED.

PARKED (rulings):
  - /target <nama> goal-detail — Ruling: out of stated scope, bare /target still works, no regression. Cost if wrong: user wants per-goal detail in chat → add handleGoalDetail later.
  - DEFAULT_ROSTER provisional model ids — Ruling: router treats a 404 as a rotation cause (noteFailure "other" bumps used → model rotates out); env GEMINI_MODELS_VISION/TEXT override; comment flags it. Cost if wrong: first call each day wastes 1 attempt per dead id before rotating. User runs scripts/list-gemini-models.mjs with a real key to finalize.
  - BOT_SETUP_CHECKLIST.md — Ruling: gitignored (BOT_*.md); edits are on disk, cannot commit. Cost if wrong: doc not in VCS (matches existing repo policy).

PLAN + REVIEW + FIXES COMPLETE. Branch feat/bot-multi-transaksi: 18 commits ad68dcd..57ee303. NOT merged (user decision).
Sibling repo: go-whatsapp-web-multidevice commit 4c8b591 (context.md phone-param doc).

## ADVERSARIAL DEEP REVIEW (user-requested 2nd pass) — 3 personas in parallel, BASE b07bde8..57ee303

## ADVERSARIAL SYNTHESIS (3 personas) — Saboteur 2C/10W · NewHire 1C/6W · Security 0C/4W
Reports: adversarial/{saboteur,newhire,security}.md

PROMOTED / MUST FIX:
  M1 collapseToSingle sums across `type` → `gaji 5jt, beli hp 3jt`+gabung = 1× Rp8M income, expense lost. [Sab C2 + NH C1] CRITICAL
  M2 commit() not idempotent → double "ok"/tap or retry-after-rememberLastBatch-throw writes batch 2×. [Sab C1] CRITICAL
  M3 fast-path reads parsed[0].confidence after buildLinesFromParsed dropped leading unparseable lines → auto-commits low-conf line unreviewed. [Sab W4→CRIT] + L0 ignores prefs.autoAcceptConfidence [NH W4]

FIX WAVE PLAN (3 sequential subagents, file overlap forces order):
  A money-core: M1 (reject set_mode:single on mixed types; gate gabung to receipt; collapseToSingle empty guard; batchSaved from collapseToSingle) + M2 (runTransaction keyed on pending) + M3 (thread LocalMatch.confidence onto DraftLine; gate L0 commitDirect on prefs.autoAcceptConfidence) + Sab N4 (stale rv:* after TTL) + N5 (bare /export→current month) + N10 (block /undo while review pending) + N11 (set_category re-validate option vs current cats)
  B robustness: Sab W1 getUserTimezone validate/fallback · W2 getPending expiresAt?.toMillis?.() · W5 L0 unresolved-date→review · W6 resolveLocally word-boundary not includes · W7 receiptDate invalid-date post-check · W8 /riwayat 0 clamp · W10 TG editMessage fallback send · Sec N1 TG secret timingSafeEqual · N3 reject non-1:1 chats both routes · N7 set_amount/set_description caps
  C cleanup/hardening: NH W5 delete dead parseIntent+schema+buildPrompt+FALLBACK+ParsedIntent · NH W6 consolidate money-column helpers · NH W1/W2 router comment contradiction + real fallback id per tier + roster-shape test + non-quota loop fail→aiUnavailable · NH W3 flow-review docstring · Sec W4 firestore.rules deny client writes new bot docs · Sec W1+Sab W9 ledger FieldValue.increment + per-user daily model-call budget · Sec N5 log error.message only · Sec N6 link-code crypto.randomInt + .create()+retry
PARK: Sab N2 (undo count = attempted) · N13/N14 (cache staleness, degrades to asking) · N15 (month attribution UTC vs tz — design-level) · Sec N2 (claim fail-open — deliberate) · N8/N9/N10.
Wave A: complete (57ee303..ce50e4b, review clean — inline). M1/M2/M3 + Sab N4/N5/N10/N11. Suite 624 green (+20), tsc 0, lint clean. M2 flow: guards on passed-in batch → claimPendingForCommit (atomic get+delete) → write; reject preserves draft, lost race → batchAlreadyHandled.
Wave B: dispatched (implementer, sonnet) — BASE ce50e4b
Wave B: complete (ce50e4b..8c979a3, review clean — inline). 10 items (Sab W1/W2/W5/W6/W7/W8/W10 + Sec N1/N3/N7). Suite 639 green (+15), tsc 0, lint clean, route 39. Note: W6  fix kills "makan"->"makanan" class; a real "makanan"-head category still whole-word-matches "makanan kucing" (acceptable, out of scope for deeper head-significance scoring).
Wave C: dispatched (implementer, sonnet) — BASE 8c979a3
Wave C: prior subagent KILLED by rate-limit mid-work. Salvaged: item 1 (parseIntent delete) + item 2 (money-column, controller completed the 5 broken batchReview call sites). REVERTED its messy roster edit (added unrequested speculative ids gemini-3.1-pro-preview/gemini-2.5-pro/etc, wrongly set gemini-2.5-flash-lite rpd 20->500, switched comments to ID). Committed clean as C.1 = 662ef79. Suite 639 green, tsc 0, lint clean.
Wave C.2: dispatched — remaining: NH W1/W2+Sab N8 router honesty · Sec W4 firestore.rules · Sec W1+Sab W9 ledger merge-write + per-user AI cap · Sec N5 log error.message · Sec N6 link-code CSPRNG
Wave C.2: complete (662ef79..dd198c9, review clean — inline). 8 items. Suite 650 green (+11), tsc 0, lint clean, route 39. Subagent restored a leftover messy roster in the working copy to baseline + 2 sanctioned -latest appends. RouterIO.save retyped so core.ts untouched.
FINAL GATE (controller): tsc 0 · vitest 650 · lint clean. Adversarial fix span 57ee303..dd198c9 = 4 commits (A/B/C.1/C.2), +934 -226 / 29 files.
Dispatching scoped re-review of the fix span.

## ADVERSARIAL RE-REVIEW — 27/27 ADDRESSED, 0 open, no material new breakage.
3 minor notes PARKED (rulings):
  - Ruling: `idr()` now duplicated render.ts + replies.ts (W6 removed padAmount/amountColumnWidth but the 3-line helper exists in both). Cosmetic DRY nit, 0 behaviour risk — not worth a 2-file edit. Cost if wrong: a future formatIDR change needs 2 edits not 1.
  - Ruling: UNRESOLVED_DATE_RE broad — some place-name strings ("...minggu...") divert to the L1 model path instead of L0. Over-cautious, never wrong-data (model path clamps + review card). Cost if wrong: a few extra L1 calls/day (bounded by the new per-user cap).
  - Ruling: commit() validates the passed-in `batch` but writes `claimed` (same pending doc). Pre-existing TOCTOU shape; the two are the same draft in every real path. Cost if wrong: a draft edited between getPending and claim in <1 concurrent window writes the pre-edit version — practically unreachable.

DONE. Branch feat/bot-multi-transaksi: 22 commits ad68dcd..dd198c9. tsc 0 / 650 tests / lint clean. NOT merged.
go-whatsapp-web-multidevice: 4c8b591 (context.md doc). WHATSAPP_AUTO_REPLY="" set in src/.env (gitignored).
