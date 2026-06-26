import { Bell, Sun, Moon, ChevronDown, LogOut, User, Settings } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/providers/AuthProvider";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface TopNavbarProps {
  pageTitle?: string;
  notificationCount?: number;
}

export default function TopNavbar({
  pageTitle,
  notificationCount = 0,
}: TopNavbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, authLogout } = useAuth();
  const [, navigate] = useLocation();

  const initials = user
    ? `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase()
    : "?";

  const displayName = user ? `${user.firstName} ${user.lastName}` : "Account";
  const displayEmail = user?.email ?? "";

  function handleSignOut() {
    authLogout();
    navigate("/login");
  }

  return (
    <header className="flex h-14 lg:h-16 shrink-0 items-center justify-between border-b border-border bg-background/95 backdrop-blur-sm px-4 lg:px-6">
      {/* Left: Page title */}
      <div className="flex items-center min-w-0">
        {pageTitle && (
          <h1 className="text-base lg:text-lg font-semibold text-foreground font-heading truncate">
            {pageTitle}
          </h1>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 lg:gap-2 shrink-0">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="h-9 w-9 text-muted-foreground hover:text-foreground"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        {/* Notification Bell */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/notifications")}
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {notificationCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: "#D4AF37", color: "#0E1B37" }}
            >
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </Button>

        {/* Profile Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-lg px-1.5 lg:px-2 py-1.5 hover:bg-secondary transition-colors outline-none">
              <Avatar className="h-8 w-8">
                <AvatarFallback
                  className="text-xs font-bold"
                  style={{
                    background: "linear-gradient(135deg, #D4AF37 0%, #F3D37A 100%)",
                    color: "#0E1B37",
                  }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden sm:flex flex-col items-start">
                <span className="text-sm font-medium text-foreground leading-none">
                  {displayName}
                </span>
                <span className="text-xs text-muted-foreground leading-tight">
                  Pro Member
                </span>
              </div>
              <ChevronDown className="hidden sm:block h-3.5 w-3.5 text-muted-foreground ml-0.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold text-foreground">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <User className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/settings")}>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleSignOut}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
