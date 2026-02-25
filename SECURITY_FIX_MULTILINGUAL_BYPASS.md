# Security Fix: Language Restriction - English Only

**Date:** February 25, 2026  
**Severity:** HIGH  
**Status:** FIXED ✅

---

## 🚨 Issue Discovered

The chatbot was bypassing library-only restrictions when users communicated in languages other than English (specifically Tagalog/Filipino).

### Example of Bypass:

**User (in Tagalog):** "pwede mo ba akong bigyan ng listahan pang bili ng bato"  
*(Translation: "can you give me a list for buying stones")*

**Bot Response (WRONG):**
```
Oo, pwede ko ikaw ng listahan! Kung nasa library ka...
* Bato ng gusali (concrete block) - P 500.00 kila unit
* Bato ng bulsa (paver stone) - P 800.00 kila unit
* Bato ng kahoy (wooden pavers) - P 1,200.00 kila unit
* Bato ng tanso (marble slab) - P 3,000.00 kalaunan
```

**Problem:** The bot provided prices and shopping information for construction materials in Tagalog, violating the library-only restriction.

---

## 🔍 Root Cause

1. **Multilingual capability:** The AI model could respond in multiple languages
2. **Language switching:** When users switched languages, restrictions were less effective
3. **No language validation:** No server-side checks to enforce English-only responses

---

## ✅ Solution Implemented

### Approach: English-Only Bot

**Decision:** Restrict bot to English-only communication to maintain security and simplify restrictions.

**Rationale:**
- Easier to enforce library-only restrictions in a single language
- Simpler validation patterns
- Users can still request human librarian for other languages
- Reduces attack surface for bypasses

---

### 1. English-Only System Prompt

**File:** `server.js` (LIBRARY_CONTEXT constant)

**Key Changes:**
```javascript
LANGUAGE RULE:
- You MUST respond ONLY in ENGLISH
- Even if the user writes in another language (Tagalog, Spanish, etc.), respond in ENGLISH
- Politely inform non-English speakers that you only communicate in English

If user writes in a non-English language, respond:
"I apologize, but I can only communicate in English. Please ask your 
question in English, or you can request to speak with a librarian for 
assistance in other languages."
```

---

### 2. Server-Side Validation

**File:** `server.js` (POST /api/chat endpoint)

**Validates two things:**
1. Forbidden content (prices, shopping, construction materials)
2. Non-English responses (detects Tagalog words)

```javascript
// Check if response is in non-English (contains Tagalog words)
const tagalogWords = /\b(ako|ang|ng|sa|mga|ka|mo|ko|ba|po|opo|mayroon|...)\b/i;
const isNonEnglish = tagalogWords.test(botResponse);

if (containsForbiddenContent || isNonEnglish) {
  const safeResponse = "I apologize, but I can only communicate in English 
  and help with library services only. Please ask your question in English 
  about library-related topics, or you can request to speak with a librarian 
  for personalized assistance.";
}
```

---

## 🧪 Testing

### Test Case 1: User writes in Tagalog
**Input:** "kumusta" or "may libro ba jan?"

**Expected Output:**
```
I apologize, but I can only communicate in English. Please ask your 
question in English, or you can request to speak with a librarian for 
assistance in other languages.
```

### Test Case 2: User asks shopping question in English
**Input:** "give me a list of concrete prices"

**Expected Output:**
```
I'm specifically designed to help with library services only. I can't 
assist with that topic, but I'd be happy to help you find books, research 
materials, or other library resources.
```

### Test Case 3: Valid English library question
**Input:** "what are your library hours?"

**Expected Output:**
```
Our library hours are:
Monday-Thursday: 8:00 AM - 10:00 PM
Friday: 8:00 AM - 6:00 PM
Saturday: 10:00 AM - 5:00 PM
Sunday: 12:00 PM - 8:00 PM
```

---

## 🛡️ Security Layers

### Layer 1: AI System Prompt (Primary Defense)
- Explicit English-only instruction
- Clear response template for non-English users
- Library-only topic restrictions

### Layer 2: Server-Side Validation (Backup Defense)
- Detects non-English responses (Tagalog word patterns)
- Detects forbidden content (prices, shopping)
- Automatic response replacement
- Logging of violations

### Layer 3: Human Escalation (Fallback)
- Users can request librarian for other languages
- Librarians can provide multilingual support
- Manual intervention available

---

## 📊 Impact

### Before Fix:
- ❌ Users could bypass restrictions using non-English languages
- ❌ Bot provided shopping lists and prices in Tagalog
- ❌ No language validation

### After Fix:
- ✅ Bot only responds in English
- ✅ Non-English responses automatically blocked
- ✅ Users directed to librarian for other languages
- ✅ Simpler, more secure restriction enforcement
- ✅ Violations logged for monitoring

---

## 💡 User Experience

**For English speakers:**
- ✅ Full bot support for library questions

**For non-English speakers:**
- ℹ️ Bot politely explains it only speaks English
- ✅ Can request human librarian for multilingual support
- ✅ Librarians can assist in any language

---

## 🚀 Deployment

**Files Changed:**
- `server.js` (LIBRARY_CONTEXT + validation logic)

**Testing Required:**
- ✅ Test English library questions (should work)
- ✅ Test non-English input (should redirect to English)
- ✅ Test shopping questions (should decline)
- ✅ Monitor logs for bypass attempts

**Rollback Plan:**
- Previous version stored in git history
- Can revert if needed
- Validation can be disabled with feature flag

---

## ✅ Verification Checklist

- [x] System prompt updated to English-only
- [x] Server-side language validation implemented
- [x] Non-English detection pattern added
- [x] Safe response for non-English users
- [x] Forbidden content patterns maintained
- [x] Logging added for violations
- [x] Documentation updated
- [ ] Tested in production
- [ ] Monitoring dashboard updated
- [ ] Team notified of changes

---

**Status:** Ready for deployment  
**Approach:** English-only bot with librarian escalation for other languages  
**Security:** Maintained through language + topic restrictions
