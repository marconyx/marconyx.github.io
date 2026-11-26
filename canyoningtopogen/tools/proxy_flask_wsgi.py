"""WSGI-Einstiegspunkt für Deployment-Server, die ein Modul `application` erwarten.

Die gesamte Proxy- und Routenlogik lebt in `proxy_flask`; dieser Adapter
exportiert lediglich die Flask-App unter dem standardisierten Namen.
"""
from proxy_flask import app as application