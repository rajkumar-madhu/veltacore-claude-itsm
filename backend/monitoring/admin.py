from django.contrib import admin

from .models import Datastore, Snapshot, VirtualMachine, VmEvent

admin.site.register(Datastore)
admin.site.register(VirtualMachine)
admin.site.register(Snapshot)
admin.site.register(VmEvent)
