// contracts/MyNFT.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Quark is ERC20 {
    address public owner;
    constructor(address _owner) ERC20("Quark", "QUARK") {
        owner = _owner;
    }
}