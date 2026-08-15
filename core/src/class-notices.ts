import { randomBytes } from "node:crypto";
import { ClassError, type ClassService } from "./classes.js";

export interface ClassNotice {
  notice_id: string;
  class_id: string;
  author_id: string;
  text: string;
  created_at: string;
}

export interface NoticeDeps {
  classService: ClassService;
  clock: () => string;
  idGenerator?: () => string;
}

// Teacher announcements (product_spec §5.2): only the class creator posts;
// only members read. No discussion threads — that is explicitly out of scope
// for the first generation.
export class ClassNoticeService {
  readonly #classes: ClassService;
  readonly #clock: () => string;
  readonly #idGenerator: () => string;
  readonly #notices = new Map<string, ClassNotice>();

  constructor(deps: NoticeDeps) {
    this.#classes = deps.classService;
    this.#clock = deps.clock;
    this.#idGenerator = deps.idGenerator ?? (() => randomBytes(8).toString("hex"));
  }

  post(creatorId: string, classId: string, text: string): ClassNotice {
    this.#classes.requireActiveClassFor(creatorId, classId);
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new ClassError("invalid_class_input", "notice text must be non-empty");
    }
    const notice: ClassNotice = Object.freeze({
      notice_id: `notice.${this.#idGenerator()}`,
      class_id: classId,
      author_id: creatorId,
      text: trimmed,
      created_at: this.#clock(),
    });
    this.#notices.set(notice.notice_id, notice);
    return notice;
  }

  noticesFor(classId: string, viewerId: string): ClassNotice[] {
    if (!this.#classes.isMember(classId, viewerId)) {
      throw new ClassError("not_class_member", `account ${viewerId} is not a member of ${classId}`);
    }
    return [...this.#notices.values()]
      .filter((notice) => notice.class_id === classId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.notice_id.localeCompare(b.notice_id));
  }
}
