#!/bin/bash
echo "Testing if setup_16.x is still available"
curl -sL https://deb.nodesource.com/setup_16.x | grep "deprecated"
