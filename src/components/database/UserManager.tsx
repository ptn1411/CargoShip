import { useState, useEffect } from "react";
import {
  Users,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  X,
  Shield,
  Edit,
  Key,
  Database,
} from "lucide-react";
import { DatabaseConnection, DatabaseUser, CreateUserInput, DatabaseInfo, databaseApi } from "../../lib/tauri";
import { useAppStore } from "../../store";
import { cn } from "../../lib/utils";

interface UserManagerProps {
  connection: DatabaseConnection;
}

const MYSQL_PRIVILEGES = [
  "ALL PRIVILEGES",
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "CREATE",
  "DROP",
  "ALTER",
  "INDEX",
  "REFERENCES",
  "CREATE VIEW",
  "SHOW VIEW",
  "TRIGGER",
  "EXECUTE",
  "GRANT OPTION",
];

const POSTGRES_PRIVILEGES = [
  "ALL",
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
  "CREATE",
  "CONNECT",
  "TEMPORARY",
  "EXECUTE",
  "USAGE",
];

type ModalType = "create" | "edit" | "password" | null;

interface EditingUser {
  username: string;
  host: string;
  currentPrivileges: string[];
}

export function UserManager({ connection }: UserManagerProps) {
  const showError = useAppStore((state) => state.showError);
  const showSuccess = useAppStore((state) => state.showSuccess);

  const [users, setUsers] = useState<DatabaseUser[]>([]);
  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);
  
  // Create user form
  const [formData, setFormData] = useState<CreateUserInput>({
    username: "",
    password: "",
    host: "%",
    privileges: ["SELECT"],
    database: undefined,
  });
  
  // Edit privileges form
  const [selectedPrivileges, setSelectedPrivileges] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>("");
  
  // Change password form
  const [newPassword, setNewPassword] = useState("");
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const privileges =
    connection.db_type === "mysql" ? MYSQL_PRIVILEGES : POSTGRES_PRIVILEGES;

  useEffect(() => {
    loadUsers();
    loadDatabases();
  }, [connection.id]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const userList = await databaseApi.listUsers(connection.id);
      setUsers(userList);
    } catch (error) {
      showError("Failed to load users", String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const loadDatabases = async () => {
    try {
      const dbs = await databaseApi.listDatabases(connection.id);
      setDatabases(dbs);
    } catch (error) {
      console.error("Failed to load databases:", error);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.username || !formData.password) {
      showError("Validation error", "Username and password are required");
      return;
    }

    setIsSubmitting(true);
    try {
      await databaseApi.createUser(connection.id, formData);
      showSuccess("User created", formData.username);
      closeModal();
      loadUsers();
    } catch (error) {
      showError("Failed to create user", String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDropUser = async (username: string, host: string) => {
    if (!confirm(`Are you sure you want to drop user "${username}"@"${host}"?`)) {
      return;
    }

    try {
      await databaseApi.dropUser(connection.id, username, host);
      showSuccess("User dropped", username);
      loadUsers();
    } catch (error) {
      showError("Failed to drop user", String(error));
    }
  };

  const handleEditPrivileges = async (user: DatabaseUser) => {
    setEditingUser({
      username: user.username,
      host: user.host,
      currentPrivileges: user.privileges,
    });
    setSelectedPrivileges([]);
    setSelectedDatabase("");
    setModalType("edit");
  };

  const handleGrantPrivileges = async () => {
    if (!editingUser || selectedPrivileges.length === 0) {
      showError("Validation error", "Please select at least one privilege");
      return;
    }

    setIsSubmitting(true);
    try {
      await databaseApi.grantPrivileges(
        connection.id,
        editingUser.username,
        editingUser.host,
        selectedPrivileges,
        selectedDatabase || undefined
      );
      showSuccess("Privileges granted", `${selectedPrivileges.join(", ")} to ${editingUser.username}`);
      closeModal();
      loadUsers();
    } catch (error) {
      showError("Failed to grant privileges", String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokePrivileges = async () => {
    if (!editingUser || selectedPrivileges.length === 0) {
      showError("Validation error", "Please select at least one privilege");
      return;
    }

    if (!confirm(`Revoke ${selectedPrivileges.join(", ")} from ${editingUser.username}?`)) {
      return;
    }

    setIsSubmitting(true);
    try {
      await databaseApi.revokePrivileges(
        connection.id,
        editingUser.username,
        editingUser.host,
        selectedPrivileges,
        selectedDatabase || undefined
      );
      showSuccess("Privileges revoked", `${selectedPrivileges.join(", ")} from ${editingUser.username}`);
      closeModal();
      loadUsers();
    } catch (error) {
      showError("Failed to revoke privileges", String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async () => {
    if (!editingUser || !newPassword) {
      showError("Validation error", "Please enter a new password");
      return;
    }

    setIsSubmitting(true);
    try {
      await databaseApi.changeUserPassword(
        connection.id,
        editingUser.username,
        editingUser.host,
        newPassword
      );
      showSuccess("Password changed", editingUser.username);
      closeModal();
    } catch (error) {
      showError("Failed to change password", String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const openPasswordModal = (user: DatabaseUser) => {
    setEditingUser({
      username: user.username,
      host: user.host,
      currentPrivileges: user.privileges,
    });
    setNewPassword("");
    setModalType("password");
  };

  const closeModal = () => {
    setModalType(null);
    setEditingUser(null);
    setFormData({
      username: "",
      password: "",
      host: "%",
      privileges: ["SELECT"],
      database: undefined,
    });
    setSelectedPrivileges([]);
    setSelectedDatabase("");
    setNewPassword("");
  };

  const togglePrivilege = (privilege: string, isCreate: boolean = false) => {
    if (isCreate) {
      setFormData((prev) => {
        const newPrivileges = prev.privileges.includes(privilege)
          ? prev.privileges.filter((p) => p !== privilege)
          : [...prev.privileges, privilege];
        return { ...prev, privileges: newPrivileges };
      });
    } else {
      setSelectedPrivileges((prev) =>
        prev.includes(privilege)
          ? prev.filter((p) => p !== privilege)
          : [...prev, privilege]
      );
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Database Users</h2>
          <span className="text-sm text-muted-foreground">({users.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadUsers}
            disabled={isLoading}
            className="p-2 rounded hover:bg-accent text-muted-foreground"
            title="Refresh"
          >
            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
          </button>
          <button
            onClick={() => setModalType("create")}
            className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
          >
            <Plus className="w-4 h-4" />
            Create User
          </button>
        </div>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Users className="w-12 h-12 mb-4 opacity-50" />
            <p>No users found</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {users.map((user) => (
              <div
                key={`${user.username}@${user.host}`}
                className="p-4 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      <span className="font-medium">{user.username}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Host: <span className="font-mono">{user.host}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEditPrivileges(user)}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="Edit privileges"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openPasswordModal(user)}
                      className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="Change password"
                    >
                      <Key className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDropUser(user.username, user.host)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Drop user"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {user.privileges.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {user.privileges.slice(0, 5).map((priv, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 text-xs rounded bg-secondary"
                      >
                        {priv}
                      </span>
                    ))}
                    {user.privileges.length > 5 && (
                      <span className="text-xs text-muted-foreground">
                        +{user.privileges.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {modalType === "create" && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                <h2 className="font-semibold">Create Database User</h2>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Username */}
              <div>
                <label className="block text-sm font-medium mb-1">Username</label>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, username: e.target.value }))
                  }
                  placeholder="new_user"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, password: e.target.value }))
                  }
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              {/* Host (MySQL only) */}
              {connection.db_type === "mysql" && (
                <div>
                  <label className="block text-sm font-medium mb-1">Host</label>
                  <select
                    value={formData.host}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, host: e.target.value }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="%">% (Any host)</option>
                    <option value="localhost">localhost</option>
                    <option value="127.0.0.1">127.0.0.1</option>
                  </select>
                </div>
              )}

              {/* Database */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  <Database className="w-4 h-4 inline mr-1" />
                  Grant on Database
                </label>
                <select
                  value={formData.database || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      database: e.target.value || undefined,
                    }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All databases (*.*)</option>
                  {databases.map((db) => (
                    <option key={db.name} value={db.name}>
                      {db.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Privileges */}
              <div>
                <label className="block text-sm font-medium mb-2">Privileges</label>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto p-2 border border-border rounded-lg">
                  {privileges.map((priv) => (
                    <button
                      key={priv}
                      type="button"
                      onClick={() => togglePrivilege(priv, true)}
                      className={cn(
                        "px-2 py-1 text-xs rounded transition-colors",
                        formData.privileges.includes(priv)
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary hover:bg-accent"
                      )}
                    >
                      {priv}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Selected: {formData.privileges.length} privilege(s)
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateUser}
                  disabled={isSubmitting || !formData.username || !formData.password}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create User
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Privileges Modal */}
      {modalType === "edit" && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-background">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <h2 className="font-semibold">
                  Manage Privileges: {editingUser.username}
                </h2>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Current Privileges */}
              {editingUser.currentPrivileges.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">Current Privileges</label>
                  <div className="p-2 border border-border rounded-lg bg-secondary/30 max-h-24 overflow-y-auto">
                    {editingUser.currentPrivileges.map((priv, i) => (
                      <div key={i} className="text-xs font-mono py-0.5">{priv}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Target Database */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  <Database className="w-4 h-4 inline mr-1" />
                  Target Database
                </label>
                <select
                  value={selectedDatabase}
                  onChange={(e) => setSelectedDatabase(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">All databases (*.*)</option>
                  {databases.map((db) => (
                    <option key={db.name} value={db.name}>
                      {db.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Privileges */}
              <div>
                <label className="block text-sm font-medium mb-2">Select Privileges to Grant/Revoke</label>
                <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2 border border-border rounded-lg">
                  {privileges.map((priv) => (
                    <button
                      key={priv}
                      type="button"
                      onClick={() => togglePrivilege(priv, false)}
                      className={cn(
                        "px-2 py-1 text-xs rounded transition-colors",
                        selectedPrivileges.includes(priv)
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary hover:bg-accent"
                      )}
                    >
                      {priv}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Selected: {selectedPrivileges.length} privilege(s)
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevokePrivileges}
                  disabled={isSubmitting || selectedPrivileges.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Revoke
                </button>
                <button
                  onClick={handleGrantPrivileges}
                  disabled={isSubmitting || selectedPrivileges.length === 0}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Grant
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {modalType === "password" && editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                <h2 className="font-semibold">Change Password</h2>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded hover:bg-accent text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="text-sm text-muted-foreground">
                User: <span className="font-medium text-foreground">{editingUser.username}@{editingUser.host}</span>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 rounded-lg border border-border hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={isSubmitting || !newPassword}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Change Password
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
