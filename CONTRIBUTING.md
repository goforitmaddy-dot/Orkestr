# Contributing to Orkestr

Welcome to Orkestr! This guide documents our Git branch and collaboration workflow to ensure safe, predictable, and clean code integration for our hackathon team.

---

## 1. Branch Strategy

We follow a structured branch workflow:

| Branch | Purpose | Protected Rules |
| :--- | :--- | :--- |
| `main` | Production-ready, stable releases. | **Never commit directly to `main`**. Merges happen exclusively via tested releases or PRs from `develop`. |
| `develop` | Active integration branch. | Central point where all features are integrated, tested, and staged. |
| `feature/<name>` | Work on specific, scoped tasks. | Created off `develop`, submitted via Pull Request back into `develop`. |

---

## 2. Feature Branch Naming Conventions

Keep branch names focused, lowercase, and descriptive:
* `feature/<feature-name>` (e.g. `feature/task-management`, `feature/ai-planner`)
* `fix/<bug-description>` (e.g. `fix/cors-origin`, `fix/db-connection-pool`)
* `chore/<task-description>` (e.g. `chore/update-readme`, `chore/eslint-setup`)

> **Rule**: Keep feature branches tightly scoped to a single task or module. Avoid bundling unrelated refactors.

---

## 3. Step-by-Step Workflow

### A. Creating a Feature Branch
Always branch off the latest `develop`:
```bash
git checkout develop
git pull origin develop
git checkout -b feature/task-management
```

### B. Keeping Synchronized with `develop`
Regularly rebase or merge `develop` into your feature branch to prevent drift:
```bash
git checkout feature/task-management
git fetch origin
git merge origin/develop
# or: git rebase origin/develop
```

### C. Testing Before Opening a Pull Request
Before submitting work, verify that compilation, linting, and tests pass:
```bash
# In backend/
npm run lint
npm run build

# In frontend/
npm run lint
npm run build
```

### D. Opening a Pull Request into `develop`
1. Push your branch to the remote:
   ```bash
   git push -u origin feature/<name>
   ```
2. Open a Pull Request on GitHub targeting **`develop`** (not `main`).
3. Include a description of changes, migrations added, and verification steps executed.

### E. Review and Merge
* Have at least one team member review and test the branch locally before merging.
* After merging into `develop`, delete the remote feature branch.
