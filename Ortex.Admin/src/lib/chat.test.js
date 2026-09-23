import { describe, expect, it } from "vitest"
import {
  attachmentPath, conversationTitle, inboxTime, linkSegments, memberLine, previewText, searchConversations,
  sortInbox, threadSections, tickState, totalUnread,
} from "./chat"

const ME = "me"
const priya = { id: "p", name: "Priya Sharma", last_read_at: null }
const rahul = { id: "r", name: "Rahul Verma", last_read_at: null }
const self = { id: ME, name: "Louis", last_read_at: null }

describe("conversation naming", () => {
  it("names a direct chat after the other person, a group by title, the assistant Anu", () => {
    expect(conversationTitle({ kind: "direct", members: [self, priya] }, ME)).toBe("Priya Sharma")
    expect(conversationTitle({ kind: "group", title: "Dispatch", members: [self, priya] }, ME)).toBe("Dispatch")
    expect(conversationTitle({ kind: "assistant", members: [self] }, ME)).toBe("Anu")
    expect(conversationTitle({ kind: "direct", members: [self] }, ME)).toBe("Former colleague")
  })

  it("lists group members with You first", () => {
    expect(memberLine({ members: [priya, self, rahul] }, ME)).toBe("You, Priya, Rahul")
  })
})

describe("previewText", () => {
  const group = { kind: "group", members: [self, priya] }
  it("prefixes the sender in groups and You for my own", () => {
    expect(previewText({ ...group, last_message: { sender_id: "p", kind: "text", body: "Dispatch\n today" } }, ME)).toBe("Priya: Dispatch today")
    expect(previewText({ ...group, last_message: { sender_id: ME, kind: "text", body: "ok" } }, ME)).toBe("You: ok")
  })
  it("describes attachments and deletions", () => {
    const dm = { kind: "direct", members: [self, priya] }
    expect(previewText({ ...dm, last_message: { sender_id: "p", kind: "text", attachment: { type: "image/png" } } }, ME)).toBe("Photo")
    expect(previewText({ ...dm, last_message: { sender_id: "p", kind: "text", attachment: { type: "application/pdf", name: "po.pdf" } } }, ME)).toBe("File: po.pdf")
    expect(previewText({ ...dm, last_message: { sender_id: "p", deleted: true } }, ME)).toBe("This message was deleted")
  })
})

describe("tickState", () => {
  const at = "2026-09-23T10:00:00Z"
  it("is read only when every other member has read past it", () => {
    const conv = { members: [self, { ...priya, last_read_at: "2026-09-23T10:01:00Z" }, { ...rahul, last_read_at: "2026-09-23T09:00:00Z" }] }
    expect(tickState({ created_at: at }, conv, ME)).toBe("sent")
    conv.members[2].last_read_at = "2026-09-23T10:00:00Z"
    expect(tickState({ created_at: at }, conv, ME)).toBe("read")
  })
  it("reports local send state first", () => {
    expect(tickState({ created_at: at, local: "pending" }, { members: [self, priya] }, ME)).toBe("pending")
  })
})

describe("threadSections", () => {
  const now = Date.parse("2026-09-23T12:00:00")
  it("groups by day and breaks runs on sender, kind or a 5 minute gap", () => {
    const m = (id, sender, time, kind = "text") => ({ id, sender_id: sender, kind, created_at: new Date(`2026-09-${time}`).toISOString() })
    const sections = threadSections([
      m("a", "p", "22T18:00:00"),
      m("b", "p", "23T09:00:00"),
      m("c", "p", "23T09:02:00"),
      m("d", "p", "23T09:10:00"),
      m("e", ME, "23T09:11:00"),
    ], now)
    expect(sections.map((s) => s.label)).toEqual(["Yesterday", "Today"])
    const today = sections[1].items
    expect(today.map((i) => [i.runStart, i.runEnd])).toEqual([[true, false], [false, true], [true, true], [true, true]])
  })
})

describe("inbox", () => {
  it("pins Anu and sorts the rest by activity", () => {
    const list = sortInbox([
      { id: "old", kind: "direct", activity_at: "2026-09-20T00:00:00Z" },
      { id: "anu", kind: "assistant", activity_at: "2026-01-01T00:00:00Z" },
      { id: "new", kind: "group", activity_at: "2026-09-22T00:00:00Z" },
    ])
    expect(list.map((c) => c.id)).toEqual(["anu", "new", "old"])
  })
  it("counts unread without muted chats", () => {
    expect(totalUnread([{ unread: 3 }, { unread: 2, muted: true }, { unread: 1 }])).toBe(4)
  })
  it("searches names, titles and the last message", () => {
    const list = [
      { id: "1", kind: "direct", members: [self, priya], last_message: { body: "invoice sent" } },
      { id: "2", kind: "group", title: "Dispatch", members: [self, rahul] },
    ]
    expect(searchConversations(list, "priya", ME).map((c) => c.id)).toEqual(["1"])
    expect(searchConversations(list, "INVOICE", ME).map((c) => c.id)).toEqual(["1"])
    expect(searchConversations(list, "rahul", ME).map((c) => c.id)).toEqual(["2"])
  })
  it("formats inbox times", () => {
    const now = Date.parse("2026-09-23T12:00:00")
    expect(inboxTime("2026-09-22T11:00:00", now)).toBe("Yesterday")
    expect(inboxTime("2026-09-23T09:05:00", now)).toBe("09:05")
  })
})

describe("files and links", () => {
  it("builds a storage path inside the conversation folder", () => {
    expect(attachmentPath("conv", "My PO (final).pdf", "u1")).toBe("conv/u1-My-PO-final-.pdf")
  })
  it("splits links out of text without trailing punctuation", () => {
    expect(linkSegments("see https://ortex.in/x, thanks")).toEqual([
      { text: "see " }, { text: "https://ortex.in/x", href: "https://ortex.in/x" }, { text: ", thanks" },
    ])
  })
})
