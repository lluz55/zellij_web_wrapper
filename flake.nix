{
  description = "Prototipo toolbar terminal";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in {
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
