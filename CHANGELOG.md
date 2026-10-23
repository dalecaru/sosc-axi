# Changelog

## [0.1.3](https://github.com/dalecaru/sosc-axi/compare/sosc-axi-v0.1.2...sosc-axi-v0.1.3) (2026-10-23)


### Features

* add actividades and tipos search commands ([#40](https://github.com/dalecaru/sosc-axi/issues/40)) ([5ebf5a0](https://github.com/dalecaru/sosc-axi/commit/5ebf5a0f443cf460409105120728de8cf8a20ab7))
* **comprobantes:** add consulta filters to ventas and compras, fix listing pagination ([#31](https://github.com/dalecaru/sosc-axi/issues/31)) ([c44f5d1](https://github.com/dalecaru/sosc-axi/commit/c44f5d19d5f0f5d8de74ed78a575926bb9116159))
* **contabilidad:** add asientos, mayor, sumasysaldos, cuentas and centroscosto ([#33](https://github.com/dalecaru/sosc-axi/issues/33)) ([1e578bf](https://github.com/dalecaru/sosc-axi/commit/1e578bf23b8b1aef91eabc63678e1a89928eabef))
* **cuits:** add sct and ccma AFIP summaries ([#41](https://github.com/dalecaru/sosc-axi/issues/41)) ([c9d8f77](https://github.com/dalecaru/sosc-axi/commit/c9d8f77537bcd51fe5fefcec05cde78dbbfab6ab)), closes [#37](https://github.com/dalecaru/sosc-axi/issues/37)
* list grupos de modificadores ([#35](https://github.com/dalecaru/sosc-axi/issues/35)) ([#39](https://github.com/dalecaru/sosc-axi/issues/39)) ([48755b7](https://github.com/dalecaru/sosc-axi/commit/48755b7422b7d659bd2fd557002bddad87fb9e58))
* list unidades, provincias and índices de ajuste ([#38](https://github.com/dalecaru/sosc-axi/issues/38)) ([8abb237](https://github.com/dalecaru/sosc-axi/commit/8abb237e6c9842440ceabfc9f9d4b2a2f8d831b5)), closes [#34](https://github.com/dalecaru/sosc-axi/issues/34)

## [0.1.2](https://github.com/dalecaru/sosc-axi/compare/sosc-axi-v0.1.1...sosc-axi-v0.1.2) (2026-10-22)


### Features

* add libroiva, iva and eventanilla commands ([#22](https://github.com/dalecaru/sosc-axi/issues/22)) ([8cd3ecc](https://github.com/dalecaru/sosc-axi/commit/8cd3eccb4a7f04c6b92ab557917e643dcb84fa90))
* **clientes:** label each row cliente, proveedor or ambos without --tipo ([#28](https://github.com/dalecaru/sosc-axi/issues/28)) ([da54e62](https://github.com/dalecaru/sosc-axi/commit/da54e62656600076379a650300429e078bbc3e81))
* cobros, pagos, recibos and cuenta corriente ([#21](https://github.com/dalecaru/sosc-axi/issues/21)) ([05102f6](https://github.com/dalecaru/sosc-axi/commit/05102f6f63f8956e9d5add8f4b55867765a2327a)), closes [#17](https://github.com/dalecaru/sosc-axi/issues/17)
* list clientes, proveedores, productos and puntos de venta ([#24](https://github.com/dalecaru/sosc-axi/issues/24)) ([d8f6c18](https://github.com/dalecaru/sosc-axi/commit/d8f6c181a3be4fd1ad5e8b7ef809e0cfe8b8baa3)), closes [#19](https://github.com/dalecaru/sosc-axi/issues/19)
* **ventas:** add create, cae, pdf and email subcommands ([#27](https://github.com/dalecaru/sosc-axi/issues/27)) ([74c0911](https://github.com/dalecaru/sosc-axi/commit/74c0911ddf9a44290c5863b47b1a215af9b8f699))


### Bug Fixes

* **commands:** match clientes, productos and puntosventa to real API responses ([#25](https://github.com/dalecaru/sosc-axi/issues/25)) ([5cbdcae](https://github.com/dalecaru/sosc-axi/commit/5cbdcaee9123a7f3f692e60267c33a99c108bc4d))

## [0.1.1](https://github.com/dalecaru/sosc-axi/compare/sosc-axi-v0.1.0-alpha.2...sosc-axi-v0.1.1) (2026-10-22)


### Miscellaneous Chores

* stable releases, patch bumps while on 0.x ([#15](https://github.com/dalecaru/sosc-axi/issues/15)) ([5db2fcc](https://github.com/dalecaru/sosc-axi/commit/5db2fcc4eb76482fd93229cad0834960e50bac7d))

## [0.1.0-alpha.2](https://github.com/dalecaru/sosc-axi/compare/sosc-axi-v0.1.0-alpha.1...sosc-axi-v0.1.0-alpha.2) (2026-10-22)


### Features

* interactive login, status command, CUITs by number only ([#6](https://github.com/dalecaru/sosc-axi/issues/6)) ([1e46e0c](https://github.com/dalecaru/sosc-axi/commit/1e46e0c26fad9b1b844ca122d046ac847a7bf4dd))
* ventas and compras listings and detail for the active CUIT ([#3](https://github.com/dalecaru/sosc-axi/issues/3)) ([c667d62](https://github.com/dalecaru/sosc-axi/commit/c667d62a00f2a0c1b37817642ef26ef5b00dea01))

## [0.1.0-alpha.1](https://github.com/dalecaru/sosc-axi/compare/sosc-axi-v0.1.0-alpha.0...sosc-axi-v0.1.0-alpha.1) (2026-10-22)


### Bug Fixes

* pass packageName so `update` installs sosc-axi ([f869ed3](https://github.com/dalecaru/sosc-axi/commit/f869ed356f8c4364df4472c8b47480858efae71b))
