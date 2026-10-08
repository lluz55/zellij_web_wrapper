{
  description = "Prototipo toolbar terminal";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      package = pkgs.buildNpmPackage {
        pname = "zellij-web-wrapper";
        version = "0.1.0";
        src = self;
        npmDepsHash = "sha256-0Tr1hcLGlzGzmFejP7tmaFDQaxEs7dIRPEUgLCj0MSM=";
        npmBuildScript = "build";
        installPhase = ''
          mkdir -p $out
          cp -r . $out/app
          makeWrapper ${pkgs.nodejs_22}/bin/node $out/bin/zellij-web \
            --add-flags "$out/app/node_modules/.bin/tsx $out/app/server/index.ts"
        '';
        nativeBuildInputs = [ pkgs.makeWrapper ];
      };
    in {
      packages.${system}.default = package;

      nixosModules.default = { config, lib, pkgs, ... }:
        let cfg = config.services.zellij-web;
        in {
          options.services.zellij-web = {
            enable = lib.mkEnableOption "Zellij Web Terminal";
            port = lib.mkOption {
              type = lib.types.port;
              default = 3001;
              description = "HTTP and WebSocket port.";
            };
            user = lib.mkOption {
              type = lib.types.str;
              default = "lluz";
              description = "User to run the terminal and zellij sessions as.";
            };
          };
          config = lib.mkIf cfg.enable {
            systemd.services.zellij-web = {
              description = "Zellij Web Terminal";
              wantedBy = [ "multi-user.target" ];
              after = [ "network.target" ];
              path = [
                pkgs.zellij
                pkgs.bashInteractive
                pkgs.coreutils
              ];
              environment = {
                PORT = toString cfg.port;
                HOME = "/home/${cfg.user}";
                USER = cfg.user;
                SHELL = "${pkgs.bashInteractive}/bin/bash";
              };
              serviceConfig = {
                User = cfg.user;
                WorkingDirectory = "/home/${cfg.user}";
                ExecStart = "${package}/bin/zellij-web";
                Restart = "on-failure";
              };
            };
          };
        };

      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          pkgs.nodejs_22
          pkgs.python3
          pkgs.pkg-config
          pkgs.gcc
          pkgs.gnumake
        ];
        shellHook = ''
          export npm_config_build_from_source=true
        '';
      };
    };
}
