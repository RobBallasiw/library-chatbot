# Canned Responses Feature - Visual Mockup

## 📋 Overview
Quick reply templates that librarians can insert with one click to save time on common questions.

---

## 🎨 UI Mockup - Librarian Dashboard

### Current Conversation Modal (Before):
```
┌─────────────────────────────────────────────────────────┐
│ Session: session_123... (🟡 Waiting)              [×]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [User Message]                                         │
│  What are your library hours?                           │
│                                                         │
│  [User Message]                                         │
│  Do you have study rooms?                               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐   │
│ │ Type your response...                           │   │
│ │                                                 │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Send]  [Warn Before Ending]  [End Session]          │
└─────────────────────────────────────────────────────────┘
```

### NEW Conversation Modal (After):
```
┌─────────────────────────────────────────────────────────┐
│ Session: session_123... (🟡 Waiting)              [×]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  [User Message]                                         │
│  What are your library hours?                           │
│                                                         │
│  [User Message]                                         │
│  Do you have study rooms?                               │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ 💬 Quick Replies:                                      │
│ ┌──────────────┬──────────────┬──────────────┐        │
│ │ 📅 Hours     │ 📚 Resources │ 💻 Tech Help │        │
│ └──────────────┴──────────────┴──────────────┘        │
│ ┌──────────────┬──────────────┬──────────────┐        │
│ │ 🏢 Locations │ 📖 Policies  │ 🎓 Research  │        │
│ └──────────────┴──────────────┴──────────────┘        │
│                                                         │
│ ┌─────────────────────────────────────────────────┐   │
│ │ Type your response...                           │   │
│ │                                                 │   │
│ └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Send]  [Warn Before Ending]  [End Session]          │
└─────────────────────────────────────────────────────────┘
```

---

## 🔘 Quick Reply Categories & Templates

### 📅 Hours Category
When clicked, shows dropdown:
```
┌─────────────────────────────────────────┐
│ 📅 Library Hours                        │
├─────────────────────────────────────────┤
│ → Regular Hours                         │
│ → Weekend Hours                         │
│ → Holiday Hours                         │
│ → Summer Hours                          │
└─────────────────────────────────────────┘
```

**Example Template - "Regular Hours":**
```
Our library hours are:
Monday-Thursday: 8:00 AM - 10:00 PM
Friday: 8:00 AM - 6:00 PM
Saturday: 10:00 AM - 5:00 PM
Sunday: 12:00 PM - 8:00 PM

Is there anything else I can help you with?
```

---

### 📚 Resources Category
```
┌─────────────────────────────────────────┐
│ 📚 Library Resources                    │
├─────────────────────────────────────────┤
│ → How to Find Books                     │
│ → Digital Resources                     │
│ → Interlibrary Loan                     │
│ → Database Access                       │
└─────────────────────────────────────────┘
```

**Example Template - "How to Find Books":**
```
To find books in our library:

1. Use our online catalog at [library-url]
2. Search by title, author, or subject
3. Note the call number and location
4. Visit the shelf or request it at the desk

Need help finding something specific?
```

---

### 💻 Tech Help Category
```
┌─────────────────────────────────────────┐
│ 💻 Technology Help                      │
├─────────────────────────────────────────┤
│ → WiFi Access                           │
│ → Printing Instructions                 │
│ → Computer Reservations                 │
│ → Scanner Help                          │
└─────────────────────────────────────────┘
```

**Example Template - "WiFi Access":**
```
To connect to library WiFi:

Network: LibraryGuest
Password: books2024

No password needed for library cardholders - just select "Library-Members" network.

Having trouble connecting?
```

---

### 🏢 Locations Category
```
┌─────────────────────────────────────────┐
│ 🏢 Library Locations                    │
├─────────────────────────────────────────┤
│ → Main Library Address                  │
│ → Branch Locations                      │
│ → Study Rooms                           │
│ → Parking Information                   │
└─────────────────────────────────────────┘
```

---

### 📖 Policies Category
```
┌─────────────────────────────────────────┐
│ 📖 Library Policies                     │
├─────────────────────────────────────────┤
│ → Borrowing Limits                      │
│ → Late Fees                             │
│ → Renewal Policy                        │
│ → Guest Access                          │
└─────────────────────────────────────────┘
```

---

### 🎓 Research Category
```
┌─────────────────────────────────────────┐
│ 🎓 Research Help                        │
├─────────────────────────────────────────┤
│ → Citation Help                         │
│ → Research Consultation                 │
│ → Subject Guides                        │
│ → Thesis Support                        │
└─────────────────────────────────────────┘
```

---

## 🎬 User Flow Example

### Scenario: User asks about hours

1. **User sends message:** "What time do you close today?"

2. **Librarian sees message in dashboard**

3. **Librarian clicks "📅 Hours" button**
   - Dropdown appears with hour templates

4. **Librarian clicks "Regular Hours"**
   - Template text is inserted into the text box
   - Librarian can edit if needed

5. **Librarian clicks "Send"**
   - Response sent to user instantly
   - Total time: 5 seconds (vs 30+ seconds typing)

---

## 🎨 Visual Design Details

### Quick Reply Buttons:
```css
Style: Rounded rectangles
Color: Light blue background (#e0f2fe)
Hover: Darker blue (#bae6fd)
Icon: Emoji + Text
Size: 120px wide, 40px tall
Spacing: 8px gap between buttons
```

### Dropdown Menu:
```css
Style: White card with shadow
Border: 1px solid #e5e7eb
Hover: Light gray background
Max height: 300px (scrollable)
Animation: Slide down (0.2s)
```

### Template Preview:
```
When hovering over a template option:
┌─────────────────────────────────────────┐
│ → Regular Hours                    [👁] │
│                                         │
│   Preview:                              │
│   "Our library hours are:               │
│   Monday-Thursday: 8:00 AM..."          │
└─────────────────────────────────────────┘
```

---

## 🔧 Management Interface (Admin Panel)

### NEW Admin Tab: "Canned Responses"
```
┌─────────────────────────────────────────────────────────┐
│  [Librarians]  [Pending Requests]  [Canned Responses]  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Manage Quick Reply Templates                          │
│                                                         │
│  📅 Hours (4 templates)                    [Edit] [+]  │
│  ├─ Regular Hours                          [Edit] [×]  │
│  ├─ Weekend Hours                          [Edit] [×]  │
│  ├─ Holiday Hours                          [Edit] [×]  │
│  └─ Summer Hours                           [Edit] [×]  │
│                                                         │
│  📚 Resources (4 templates)                [Edit] [+]  │
│  💻 Tech Help (4 templates)                [Edit] [+]  │
│  🏢 Locations (4 templates)                [Edit] [+]  │
│  📖 Policies (4 templates)                 [Edit] [+]  │
│  🎓 Research (4 templates)                 [Edit] [+]  │
│                                                         │
│  [+ Add New Category]                                  │
└─────────────────────────────────────────────────────────┘
```

### Edit Template Modal:
```
┌─────────────────────────────────────────┐
│ Edit Template                      [×]  │
├─────────────────────────────────────────┤
│ Template Name:                          │
│ ┌─────────────────────────────────────┐ │
│ │ Regular Hours                       │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Category:                               │
│ ┌─────────────────────────────────────┐ │
│ │ 📅 Hours                ▼          │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Template Text:                          │
│ ┌─────────────────────────────────────┐ │
│ │ Our library hours are:              │ │
│ │ Monday-Thursday: 8:00 AM - 10:00 PM │ │
│ │ Friday: 8:00 AM - 6:00 PM           │ │
│ │ ...                                 │ │
│ └─────────────────────────────────────┘ │
│                                         │
│  [Cancel]              [Save Template]  │
└─────────────────────────────────────────┘
```

---

## 📊 Benefits

### For Librarians:
- ⚡ **90% faster responses** for common questions
- 🎯 **Consistent answers** across all librarians
- 😌 **Less typing fatigue**
- 📝 **Easy to customize** before sending

### For Users:
- ⏱️ **Faster response times**
- ✅ **Accurate information**
- 📚 **Complete answers** (nothing forgotten)

### For Admins:
- 📊 **Track which templates are used most**
- 🔄 **Update all responses in one place**
- 🎓 **Train new librarians faster**

---

## 🎯 Default Templates Included

We'll include 24 pre-written templates across 6 categories:
- 4 templates per category
- Covering 80% of common questions
- Fully customizable by admins

---

## 💾 Data Storage

Templates stored in: `canned-responses.json`
```json
{
  "categories": [
    {
      "id": "hours",
      "name": "Hours",
      "icon": "📅",
      "templates": [
        {
          "id": "regular-hours",
          "name": "Regular Hours",
          "text": "Our library hours are:\nMonday-Thursday: 8:00 AM - 10:00 PM..."
        }
      ]
    }
  ]
}
```

---

## 🚀 Implementation Plan

### Phase 1: Basic Functionality (1 hour)
- Add quick reply buttons to conversation modal
- Load templates from JSON file
- Insert template into text box on click

### Phase 2: Management Interface (1 hour)
- Add "Canned Responses" tab to admin panel
- Create/edit/delete templates
- Organize by categories

### Phase 3: Polish (30 min)
- Add animations
- Template preview on hover
- Search/filter templates

---

## ✨ Future Enhancements (Optional)

- 🔍 **Search templates** by keyword
- 📊 **Usage analytics** (most used templates)
- 🎨 **Template variables** (insert user name, date, etc.)
- 🌐 **Multi-language templates**
- 📱 **Mobile-optimized layout**
- ⌨️ **Keyboard shortcuts** (Ctrl+1 for first template, etc.)

---

Ready to build this? It'll make your librarians super efficient! 🚀
