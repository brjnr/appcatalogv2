"""Seed the catalog: categories, users (RBAC), and applications.

Run: cd /app/backend && python seed.py
Idempotent: clears apps/categories/users/sessions, then re-inserts + re-applies indexes.

Seeded accounts (see memory/test_credentials.md):
  admin@corp.com          (username: admin)         / Admin!Passw0rd_1  — Administrator
  john.doe@corp.com       (username: john.doe)      / User!Passw0rd_1   — Normal User (Security + Monitoring)
  maria.garcia@corp.com   (username: maria.garcia)  / User!Passw0rd_1   — Normal User (HR + Finance)
"""

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from lib.auth import hash_password
from lib.db import db, ensure_indexes
from models.catalog import AppCreate
from models.users import LoginRequest  # noqa: F401  (sanity: models importable)

CATEGORY_SEEDS = [
    {"name": "Business", "icon": "Briefcase", "description": "Productivity, projects, and CRM."},
    {"name": "Infrastructure", "icon": "Server", "description": "Compute, automation, and orchestration."},
    {"name": "Network", "icon": "Network", "description": "Firewalls, routing, and DNS."},
    {"name": "Security", "icon": "ShieldAlert", "description": "Access, threats, and compliance."},
    {"name": "Monitoring", "icon": "Activity", "description": "Observability and alerting."},
    {"name": "Data Center", "icon": "Database", "description": "Storage, backup, and HCI."},
    {"name": "HR", "icon": "Users", "description": "People, hiring, and culture."},
    {"name": "Finance", "icon": "DollarSign", "description": "ERP, spend, and planning."},
]

USER_SEEDS = [
    {
        "name": "Ada Admin",
        "username": "admin",
        "email": "admin@corp.com",
        "password": "Admin!Passw0rd_1",
        "role": "administrator",
        "assigned_category_ids": [],  # admins are unrestricted
        "department": "Infrastructure",
    },
    {
        "name": "John Doe",
        "username": "john.doe",
        "email": "john.doe@corp.com",
        "password": "User!Passw0rd_1",
        "role": "normal_user",
        "department": "Security",
        "assigned_categories": ["Security", "Monitoring"],
    },
    {
        "name": "Maria Garcia",
        "username": "maria.garcia",
        "email": "maria.garcia@corp.com",
        "password": "User!Passw0rd_1",
        "role": "normal_user",
        "department": "Business Applications",
        "assigned_categories": ["HR", "Finance"],
    },
]

APPS = [
    # Business
    {"name": "Jira Software", "category": "Business", "icon": "SquareCheck", "url": "https://jira.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 23500, "favorite_count": 1450,
     "description": "Issue tracking, agile sprint planning, and project workflow management for engineering and enterprise operations. Teams plan sprints, track blockers, and ship releases from a single board."},
    {"name": "Salesforce CRM", "category": "Business", "icon": "Briefcase", "url": "https://crm.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 16500, "favorite_count": 920,
     "description": "Customer relationship management engine tracking the global pipeline, customer accounts, contracts, and revenue. The system of record for every customer-facing conversation."},
    {"name": "Confluence Wiki", "category": "Business", "icon": "BookOpen", "url": "https://confluence.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 21000, "favorite_count": 1150,
     "description": "Corporate knowledge base, engineering documentation, technical runbooks, and team workspaces. Every process, policy, and post-mortem lives here."},
    {"name": "Tableau Server", "category": "Business", "icon": "ChartColumn", "url": "https://tableau.internal.corp", "environment": "Production", "status": "Active", "usage_count": 14900, "favorite_count": 780,
     "description": "Enterprise executive reporting, business intelligence dashboards, and interactive visual data analytics for every department."},
    {"name": "Asana Enterprise", "category": "Business", "icon": "SquareKanban", "url": "https://asana.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 11200, "favorite_count": 610,
     "description": "Cross-functional project tracking, operational roadmaps, team task assignment, and portfolio timelines."},
    # Infrastructure
    {"name": "VMware vCenter", "category": "Infrastructure", "icon": "Server", "url": "https://vcenter.internal.corp", "environment": "On-Premises", "status": "Active", "usage_count": 9850, "favorite_count": 530,
     "description": "Centralized virtualization management platform controlling ESXi hypervisors, VM provisioning, and storage pools across all compute clusters."},
    {"name": "Red Hat Ansible Tower", "category": "Infrastructure", "icon": "Cpu", "url": "https://ansible.internal.corp", "environment": "Internal", "status": "Active", "usage_count": 7600, "favorite_count": 480,
     "description": "Automation controller for executing playbook deployments, configuration management, and system patching across the fleet."},
    {"name": "Kubernetes OpenShift", "category": "Infrastructure", "icon": "Box", "url": "https://openshift.internal.corp", "environment": "Production", "status": "Active", "usage_count": 17200, "favorite_count": 1040,
     "description": "Enterprise container orchestration platform managing microservices, ingress routes, and CI/CD pods for all product teams."},
    {"name": "Terraform Enterprise", "category": "Infrastructure", "icon": "FolderGit2", "url": "https://terraform.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 12100, "favorite_count": 820,
     "description": "Infrastructure as Code collaborative platform managing cloud resource state files, policies, and drift detection."},
    # Network
    {"name": "Palo Alto Panorama", "category": "Network", "icon": "Network", "url": "https://panorama.internal.corp", "environment": "Production", "status": "Active", "usage_count": 5200, "favorite_count": 290,
     "description": "Centralized next-generation firewall management, security policy distribution, and global network routing."},
    {"name": "Cisco DNA Center", "category": "Network", "icon": "Share2", "url": "https://dnac.internal.corp", "environment": "Production", "status": "Active", "usage_count": 3400, "favorite_count": 190,
     "description": "Software-defined networking controller for switch fabrics, wireless access points, and zero-trust access policies."},
    {"name": "F5 BIG-IP LTM", "category": "Network", "icon": "Workflow", "url": "https://f5.internal.corp", "environment": "Production", "status": "Active", "usage_count": 4800, "favorite_count": 210,
     "description": "Local traffic management, SSL offloading, global server load balancing, and application acceleration for public services."},
    {"name": "Infoblox DDI", "category": "Network", "icon": "Globe", "url": "https://infoblox.internal.corp", "environment": "Production", "status": "Active", "usage_count": 5500, "favorite_count": 270,
     "description": "Enterprise core network services managing authoritative DNS zones, DHCP scopes, and IP address management (IPAM)."},
    # Security
    {"name": "CyberArk PAS", "category": "Security", "icon": "ShieldAlert", "url": "https://cyberark.internal.corp", "environment": "Production", "status": "Active", "usage_count": 8940, "favorite_count": 420,
     "description": "Privileged Access Security solution protecting enterprise credentials, session management, and credential vaulting for administrators."},
    {"name": "Tenable Nessus", "category": "Security", "icon": "Lock", "url": "https://tenable.internal.corp", "environment": "Production", "status": "Active", "usage_count": 6300, "favorite_count": 310,
     "description": "Vulnerability scanning, continuous threat exposure assessment, and automated compliance auditing across all assets."},
    {"name": "Splunk Enterprise SIEM", "category": "Security", "icon": "Radio", "url": "https://siem.internal.corp", "environment": "Production", "status": "Active", "usage_count": 18900, "favorite_count": 870,
     "description": "Security information and event management aggregating terabytes of logs for real-time threat intelligence and incident response."},
    {"name": "HashiCorp Vault", "category": "Security", "icon": "KeyRound", "url": "https://vault.internal.corp", "environment": "Production", "status": "Active", "usage_count": 15600, "favorite_count": 890,
     "description": "Dynamic secrets management, TLS certificate authority, encryption-as-a-service, and token brokering for every service."},
    {"name": "CrowdStrike Falcon", "category": "Security", "icon": "Eye", "url": "https://falcon.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 9300, "favorite_count": 460,
     "description": "Cloud-native endpoint detection and response (EDR) platform preventing malware and unauthorized processes on every laptop and server."},
    {"name": "Okta Verify SSO", "category": "Security", "icon": "ShieldCheck", "url": "https://sso.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 42000, "favorite_count": 2400,
     "description": "Identity and access management provider with adaptive multi-factor authentication and universal directory. Your single sign-on to everything."},
    # Monitoring
    {"name": "Grafana Enterprise", "category": "Monitoring", "icon": "Activity", "url": "https://grafana.internal.corp", "environment": "Production", "status": "Active", "usage_count": 14200, "favorite_count": 910,
     "description": "Operational observability platform providing unified telemetry dashboards, logs, and real-time alerting pipelines."},
    {"name": "Datadog APM", "category": "Monitoring", "icon": "Gauge", "url": "https://datadog.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 12800, "favorite_count": 760,
     "description": "Distributed tracing, synthetic monitoring, serverless metrics, and real-time application health metrics."},
    {"name": "Prometheus & Alertmanager", "category": "Monitoring", "icon": "BellRing", "url": "https://prometheus.internal.corp", "environment": "Production", "status": "Active", "usage_count": 13900, "favorite_count": 680,
     "description": "Time-series dimensional metric scraping engine with customizable alerting rules for Kubernetes clusters."},
    {"name": "Dynatrace OneAgent", "category": "Monitoring", "icon": "ChartLine", "url": "https://dynatrace.internal.corp", "environment": "Production", "status": "Active", "usage_count": 6900, "favorite_count": 340,
     "description": "Full-stack AI-assisted application performance monitoring, automated root-cause analysis, and user telemetry."},
    {"name": "Zabbix Infrastructure", "category": "Monitoring", "icon": "Terminal", "url": "https://zabbix.internal.corp", "environment": "Internal", "status": "Deprecated", "usage_count": 1400, "favorite_count": 40,
     "description": "Agent-based network device and hardware sensor monitoring for distributed edge data centers. Scheduled for decommission in favor of Prometheus."},
    # Data Center
    {"name": "Veeam Backup & Replication", "category": "Data Center", "icon": "HardDrive", "url": "https://veeam.internal.corp", "environment": "On-Premises", "status": "Active", "usage_count": 4120, "favorite_count": 280,
     "description": "Enterprise automated backup, disaster recovery, and data protection suite for virtual and physical workloads."},
    {"name": "NetApp ONTAP SAN", "category": "Data Center", "icon": "Database", "url": "https://ontap.internal.corp", "environment": "On-Premises", "status": "Active", "usage_count": 2900, "favorite_count": 140,
     "description": "Enterprise unified hybrid storage management system for NFS/CIFS shares and iSCSI high-availability volumes."},
    {"name": "Nutanix Prism Central", "category": "Data Center", "icon": "Boxes", "url": "https://nutanix.internal.corp", "environment": "On-Premises", "status": "Active", "usage_count": 3100, "favorite_count": 170,
     "description": "Hyperconverged infrastructure management console overseeing distributed storage fabric and compute clusters."},
    {"name": "Pure Storage FlashBlade", "category": "Data Center", "icon": "Zap", "url": "https://purestorage.internal.corp", "environment": "On-Premises", "status": "Maintenance", "usage_count": 2100, "favorite_count": 95,
     "description": "Unified fast-file and object storage management for AI workloads, analytics, and rapid backup restore."},
    # HR
    {"name": "Workday HRIS", "category": "HR", "icon": "Users", "url": "https://workday.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 31000, "favorite_count": 1820,
     "description": "Human capital management system for the employee directory, benefits enrollment, PTO scheduling, and payroll. Every employee's first stop."},
    {"name": "Greenhouse Recruiting", "category": "HR", "icon": "UserPlus", "url": "https://greenhouse.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 4700, "favorite_count": 230,
     "description": "Applicant tracking system, candidate pipeline coordinator, and structured interview feedback portal for hiring teams."},
    {"name": "Culture Amp", "category": "HR", "icon": "Heart", "url": "https://cultureamp.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 3800, "favorite_count": 190,
     "description": "Employee engagement surveys, 360-degree performance evaluations, and employee wellness analytics."},
    {"name": "Lattice Goals & 1:1s", "category": "HR", "icon": "Target", "url": "https://lattice.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 5800, "favorite_count": 310,
     "description": "People management platform for OKR tracking, continuous feedback loops, and 1-on-1 manager syncs."},
    # Finance
    {"name": "SAP S/4HANA ERP", "category": "Finance", "icon": "DollarSign", "url": "https://erp.internal.corp", "environment": "Production", "status": "Active", "usage_count": 11400, "favorite_count": 640,
     "description": "Central enterprise resource planning system managing ledgers, corporate purchasing, assets, and invoices."},
    {"name": "Coupa Procurement", "category": "Finance", "icon": "CreditCard", "url": "https://coupa.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 8200, "favorite_count": 390,
     "description": "Business spend management, purchase order approvals, supplier contracts, and corporate expense tracking."},
    {"name": "Expensify Enterprise", "category": "Finance", "icon": "Receipt", "url": "https://expensify.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 19400, "favorite_count": 1100,
     "description": "Receipt scanning, corporate card reconciliation, employee expense reports, and automated reimbursement."},
    {"name": "Anaplan Modeling", "category": "Finance", "icon": "ChartPie", "url": "https://anaplan.internal.corp", "environment": "Cloud", "status": "Active", "usage_count": 4300, "favorite_count": 220,
     "description": "Connected financial planning, budgeting simulations, headcount capacity modeling, and forecast scenario analytics."},
]


SERVER_SEEDS = [
    {"name": "SEC-PROD-01", "hostname": "security-prod-01", "ip_address": "10.10.10.101", "vm_name": "SEC-PROD01",
     "os": "Ubuntu Server", "os_version": "22.04 LTS", "server_type": "Virtual Machine", "environment": "Production",
     "status": "Active", "cpu": "8 Core", "ram": "32 GB", "storage": "500 GB SSD", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "PROD-CLUSTER-A", "virtualization": "VMware vSphere 8",
     "description": "Primary application node for privileged access and SIEM collectors.",
     "apps": ["CyberArk PAS", "Splunk Enterprise SIEM"], "pics": ["Jane Smith", "Andi Pratama"]},
    {"name": "SEC-PROD-02", "hostname": "security-prod-02", "ip_address": "10.10.10.102", "vm_name": "SEC-PROD02",
     "os": "Ubuntu Server", "os_version": "22.04 LTS", "server_type": "Virtual Machine", "environment": "Production",
     "status": "Active", "cpu": "8 Core", "ram": "32 GB", "storage": "500 GB SSD", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "PROD-CLUSTER-A", "virtualization": "VMware vSphere 8",
     "description": "Secondary security node providing HA failover for the vault and EDR console.",
     "apps": ["HashiCorp Vault", "CrowdStrike Falcon"], "pics": ["Jane Smith"]},
    {"name": "SEC-DB-01", "hostname": "security-db-01", "ip_address": "10.10.10.110", "vm_name": "SECDB01",
     "os": "Red Hat Enterprise Linux", "os_version": "9.3", "server_type": "Database Server", "environment": "Production",
     "status": "Active", "cpu": "16 Core", "ram": "64 GB", "storage": "2 TB NVMe", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "DB-CLUSTER-01", "virtualization": "Bare Metal",
     "description": "PostgreSQL cluster storing audit trails and credential vault metadata.",
     "apps": ["CyberArk PAS", "Tenable Nessus"], "pics": ["Andi Pratama"]},
    {"name": "MON-PROD-01", "hostname": "monitor-prod-01", "ip_address": "10.10.20.101", "vm_name": "MONPROD01",
     "os": "Debian", "os_version": "12", "server_type": "Virtual Machine", "environment": "Production",
     "status": "Active", "cpu": "12 Core", "ram": "48 GB", "storage": "1 TB SSD", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "PROD-CLUSTER-B", "virtualization": "VMware vSphere 8",
     "description": "Observability stack host running dashboards and the metric scrapers.",
     "apps": ["Grafana Enterprise", "Prometheus & Alertmanager"], "pics": ["Jane Smith", "Siti Rahayu"]},
    {"name": "MON-PROD-02", "hostname": "monitor-prod-02", "ip_address": "10.10.20.102", "vm_name": "MONPROD02",
     "os": "Debian", "os_version": "12", "server_type": "Virtual Machine", "environment": "Production",
     "status": "Maintenance", "cpu": "8 Core", "ram": "32 GB", "storage": "1 TB SSD", "datacenter": "Bandung DC2", "location": "DRC",
     "cluster": "PROD-CLUSTER-B", "virtualization": "VMware vSphere 8",
     "description": "APM and tracing collector node. Currently under scheduled kernel patching.",
     "apps": ["Dynatrace OneAgent", "Zabbix Infrastructure"], "pics": ["Siti Rahayu"]},
    {"name": "INF-VC-01", "hostname": "vcenter-01", "ip_address": "10.10.30.11", "vm_name": "VCSA01",
     "os": "VMware Photon OS", "os_version": "5.0", "server_type": "Appliance", "environment": "Production",
     "status": "Active", "cpu": "8 Core", "ram": "28 GB", "storage": "800 GB", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "MGMT-CLUSTER", "virtualization": "VMware vSphere 8",
     "description": "vCenter Server Appliance managing all production ESXi hosts.",
     "apps": ["VMware vCenter"], "pics": ["Budi Santoso"]},
    {"name": "INF-K8S-01", "hostname": "openshift-master-01", "ip_address": "10.10.30.21", "vm_name": "OCPM01",
     "os": "Red Hat CoreOS", "os_version": "4.15", "server_type": "Control Plane", "environment": "Production",
     "status": "Active", "cpu": "16 Core", "ram": "64 GB", "storage": "1 TB NVMe", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "OCP-PROD", "virtualization": "Bare Metal",
     "description": "OpenShift control-plane node hosting the API server and etcd.",
     "apps": ["Kubernetes OpenShift", "Terraform Enterprise"], "pics": ["Budi Santoso", "Andi Pratama"]},
    {"name": "INF-AUTO-01", "hostname": "ansible-tower-01", "ip_address": "10.10.30.31", "vm_name": "AWX01",
     "os": "Red Hat Enterprise Linux", "os_version": "9.3", "server_type": "Virtual Machine", "environment": "Internal",
     "status": "Active", "cpu": "8 Core", "ram": "24 GB", "storage": "400 GB SSD", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "MGMT-CLUSTER", "virtualization": "VMware vSphere 8",
     "description": "Automation controller executing playbooks and patch pipelines.",
     "apps": ["Red Hat Ansible Tower"], "pics": ["Budi Santoso"]},
    {"name": "NET-FW-01", "hostname": "panorama-01", "ip_address": "10.10.40.11", "vm_name": "PANO01",
     "os": "PAN-OS", "os_version": "11.1", "server_type": "Appliance", "environment": "Production",
     "status": "Active", "cpu": "8 Core", "ram": "32 GB", "storage": "2 TB", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "NET-EDGE", "virtualization": "Bare Metal",
     "description": "Panorama management appliance for the next-generation firewall estate.",
     "apps": ["Palo Alto Panorama", "F5 BIG-IP LTM"], "pics": ["Rizki Hakim"]},
    {"name": "NET-DNS-01", "hostname": "infoblox-01", "ip_address": "10.10.40.21", "vm_name": "IBLOX01",
     "os": "NIOS", "os_version": "9.0", "server_type": "Appliance", "environment": "Production",
     "status": "Active", "cpu": "4 Core", "ram": "16 GB", "storage": "250 GB", "datacenter": "Bandung DC2", "location": "DRC",
     "cluster": "NET-CORE", "virtualization": "Bare Metal",
     "description": "Authoritative DNS, DHCP, and IPAM grid member.",
     "apps": ["Infoblox DDI", "Cisco DNA Center"], "pics": ["Rizki Hakim"]},
    {"name": "DC-BKP-01", "hostname": "veeam-backup-01", "ip_address": "10.10.50.11", "vm_name": "VEEAM01",
     "os": "Windows Server", "os_version": "2022", "server_type": "Backup Server", "environment": "Production",
     "status": "Active", "cpu": "16 Core", "ram": "64 GB", "storage": "40 TB", "datacenter": "Bandung DC2", "location": "DRC",
     "cluster": "BACKUP-CLUSTER", "virtualization": "Bare Metal",
     "description": "Backup proxy and repository for virtual and physical workloads.",
     "apps": ["Veeam Backup & Replication", "NetApp ONTAP SAN"], "pics": ["Budi Santoso", "Siti Rahayu"]},
    {"name": "BIZ-APP-01", "hostname": "jira-app-01", "ip_address": "10.10.60.11", "vm_name": "JIRA01",
     "os": "Ubuntu Server", "os_version": "22.04 LTS", "server_type": "Application Server", "environment": "Production",
     "status": "Active", "cpu": "8 Core", "ram": "32 GB", "storage": "600 GB SSD", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "BIZ-CLUSTER", "virtualization": "VMware vSphere 8",
     "description": "Hosts the issue tracker and the corporate wiki application tier.",
     "apps": ["Jira Software", "Confluence Wiki"], "pics": ["Dewi Lestari"]},
    {"name": "FIN-ERP-01", "hostname": "sap-erp-01", "ip_address": "10.10.70.11", "vm_name": "SAPERP01",
     "os": "SUSE Linux Enterprise", "os_version": "15 SP5", "server_type": "Application Server", "environment": "Production",
     "status": "Active", "cpu": "32 Core", "ram": "256 GB", "storage": "4 TB NVMe", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "SAP-CLUSTER", "virtualization": "Bare Metal",
     "description": "SAP S/4HANA application server for finance and procurement modules.",
     "apps": ["SAP S/4HANA ERP", "Coupa Procurement"], "pics": ["Dewi Lestari"]},
    {"name": "STG-TEST-01", "hostname": "staging-test-01", "ip_address": "10.20.10.11", "vm_name": "STGTEST01",
     "os": "Ubuntu Server", "os_version": "24.04 LTS", "server_type": "Virtual Machine", "environment": "Staging",
     "status": "Active", "cpu": "4 Core", "ram": "16 GB", "storage": "200 GB SSD", "datacenter": "Jakarta DC1", "location": "DC",
     "cluster": "STG-CLUSTER", "virtualization": "VMware vSphere 8",
     "description": "Shared staging host. Not yet assigned to an application or PIC.",
     "apps": [], "pics": []},
]

PIC_SEEDS = [
    {"name": "Jane Smith", "initials": "JS", "employee_id": "EMP002", "email": "jane.smith@company.com",
     "phone": "+62 811-1000-002", "department": "IT Infrastructure", "position": "Infrastructure Engineer",
     "team": "Infrastructure",
     "status": "Active", "apps": ["Splunk Enterprise SIEM", "Grafana Enterprise"],
     "standby": [("Splunk Enterprise SIEM", 1, "Primary on-call for SIEM ingestion"),
                 ("Grafana Enterprise", 6, "Dashboard and alerting coverage")]},
    {"name": "Andi Pratama", "initials": "AP", "employee_id": "EMP007", "email": "andi.pratama@company.com",
     "phone": "+62 811-1000-007", "department": "Security Operations", "position": "Security Engineer",
     "team": "Security",
     "status": "Active", "apps": ["CyberArk PAS", "Tenable Nessus", "HashiCorp Vault"],
     "standby": [("CyberArk PAS", 3, "Credential vault escalation"),
                 ("Tenable Nessus", 9, "Vulnerability scan window")]},
    {"name": "Budi Santoso", "initials": "BS", "employee_id": "EMP011", "email": "budi.santoso@company.com",
     "phone": "+62 811-1000-011", "department": "IT Infrastructure", "position": "Virtualization Lead",
     "team": "Infrastructure",
     "status": "Active", "apps": ["VMware vCenter", "Kubernetes OpenShift", "Veeam Backup & Replication"],
     "standby": [("VMware vCenter", 2, "Hypervisor maintenance window"),
                 ("Veeam Backup & Replication", 12, "Backup restore verification")]},
    {"name": "Siti Rahayu", "initials": "SR", "employee_id": "EMP015", "email": "siti.rahayu@company.com",
     "phone": "+62 811-1000-015", "department": "Monitoring & Observability", "position": "SRE",
     "team": "Monitoring",
     "status": "Active", "apps": ["Prometheus & Alertmanager", "Dynatrace OneAgent", "Datadog APM"],
     "standby": [("Prometheus & Alertmanager", 4, "Alert routing duty"),
                 ("Datadog APM", 11, "Trace pipeline monitoring")]},
    {"name": "Rizki Hakim", "initials": "RH", "employee_id": "EMP021", "email": "rizki.hakim@company.com",
     "phone": "+62 811-1000-021", "department": "Network Engineering", "position": "Network Architect",
     "team": "Network",
     "status": "Active", "apps": ["Palo Alto Panorama", "Infoblox DDI", "Cisco DNA Center"],
     "standby": [("Palo Alto Panorama", 5, "Firewall policy change freeze")]},
    {"name": "Dewi Lestari", "initials": "DL", "employee_id": "EMP029", "email": "dewi.lestari@company.com",
     "phone": "+62 811-1000-029", "department": "Business Applications", "position": "Application Support Lead",
     "team": "Business Applications",
     "status": "Inactive", "apps": ["Jira Software", "SAP S/4HANA ERP"],
     "standby": [("SAP S/4HANA ERP", 8, "Month-end close support")]},
]


DEPARTMENT_SEEDS = [
    ("Infrastructure", "Servers, virtualization, storage, and backup platforms"),
    ("Security", "Identity, vaulting, vulnerability management, and SOC tooling"),
    ("Monitoring", "Observability, APM, alert routing, and dashboards"),
    ("Network", "Routing, firewalls, DNS/DHCP/IPAM, and campus networking"),
    ("Business Applications", "ERP, CRM, HR, finance, and collaboration apps"),
]


async def seed() -> None:
    now = datetime.now(timezone.utc)

    # Fresh RBAC state: sessions first (they reference soon-to-change user ids).
    await db.sessions.delete_many({})
    await db.users.delete_many({})
    await db.categories.delete_many({})
    await db.apps.delete_many({})

    # Categories
    category_ids: dict[str, str] = {}
    for spec in CATEGORY_SEEDS:
        category_id = str(uuid.uuid4())
        category_ids[spec["name"]] = category_id
        await db.categories.insert_one(
            {
                "id": category_id,
                "name": spec["name"],
                "description": spec.get("description", ""),
                "icon": spec.get("icon", "Layers"),
                "icon_url": None,
                "status": "active",
                "created_at": now,
                "updated_at": now,
            }
        )

    # Users (passwords hashed — never stored in clear)
    for spec in USER_SEEDS:
        assigned = spec.get("assigned_categories", [])
        await db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "name": spec["name"],
                "username": spec["username"],
                "email": spec["email"],
                "role": spec["role"],
                "assigned_category_ids": [category_ids[name] for name in assigned],
                "is_active": True,
                "password_hash": hash_password(spec["password"]),
                "created_at": now,
                "updated_at": now,
            }
        )

    # Applications — mapped to category ids
    docs = []
    for i, spec in enumerate(APPS):
        payload = AppCreate(
            name=spec["name"],
            description=spec["description"],
            category_id=category_ids[spec["category"]],
            environment=spec["environment"],
            status=spec["status"],
            url=spec["url"],
            icon=spec["icon"],
        )
        docs.append(
            {
                **payload.model_dump(),
                "id": str(uuid.uuid4()),
                "usage_count": spec["usage_count"],
                "favorite_count": spec["favorite_count"],
                # stagger history so Recently Added / Recently Updated sorts are meaningful
                "created_at": now - timedelta(days=5 + i * 19),
                "updated_at": now - timedelta(days=1 + (i * 3) % 41),
            }
        )
    await db.apps.insert_many(docs)
    app_ids = {doc["name"]: doc["id"] for doc in docs}

    # Departments (PICs reference them by id)
    await db.departments.delete_many({})
    department_ids: dict[str, str] = {}
    for dept_name, dept_desc in DEPARTMENT_SEEDS:
        dept_id = str(uuid.uuid4())
        department_ids[dept_name] = dept_id
        await db.departments.insert_one(
            {
                "id": dept_id,
                "name": dept_name,
                "description": dept_desc,
                "status": "active",
                "created_at": now,
                "updated_at": now,
            }
        )

    # Users belong to a department too (drives note sharing / editing).
    for dept_name, dept_id in department_ids.items():
        await db.users.update_many(
            {"email": {"$in": [u["email"] for u in USER_SEEDS if u.get("department") == dept_name]}},
            {"$set": {"department_id": dept_id}},
        )

    # Notes are transient scratch data — start clean.
    await db.notes.delete_many({})

    # PICs first (servers reference them by id)
    await db.pics.delete_many({})
    await db.servers.delete_many({})
    pic_ids: dict[str, str] = {}
    for spec in PIC_SEEDS:
        pic_id = str(uuid.uuid4())
        pic_ids[spec["name"]] = pic_id
        await db.pics.insert_one(
            {
                "id": pic_id,
                "name": spec["name"],
                "initials": spec["initials"],
                "employee_id": spec["employee_id"],
                "email": spec["email"],
                "phone": spec["phone"],
                "department_id": department_ids[spec["team"]],
                "department": spec["team"],
                "position": spec["position"],
                "status": spec["status"],
                "application_ids": [app_ids[name] for name in spec["apps"]],
                "standby_schedule": [
                    {
                        "date": (now + timedelta(days=offset)).strftime("%Y-%m-%d"),
                        "application_id": app_ids[app_name],
                        "notes": note,
                    }
                    for app_name, offset, note in spec["standby"]
                ],
                "created_at": now,
                "updated_at": now,
            }
        )

    for spec in SERVER_SEEDS:
        await db.servers.insert_one(
            {
                "id": str(uuid.uuid4()),
                "name": spec["name"],
                "hostname": spec["hostname"],
                "ip_address": spec["ip_address"],
                "vm_name": spec["vm_name"],
                "os": spec["os"],
                "os_version": spec["os_version"],
                "server_type": spec["server_type"],
                "environment": spec["environment"],
                "location": spec.get("location", "DC"),
                "status": spec["status"],
                "cpu": spec["cpu"],
                "ram": spec["ram"],
                "storage": spec["storage"],
                "datacenter": spec["datacenter"],
                "cluster": spec["cluster"],
                "virtualization": spec["virtualization"],
                "description": spec["description"],
                "application_ids": [app_ids[name] for name in spec["apps"]],
                "pic_ids": [pic_ids[name] for name in spec["pics"]],
                "created_at": now,
                "updated_at": now,
            }
        )

    await ensure_indexes()
    # A couple of Jira tickets so the server drawer has history to show.
    ticket_specs = [
        ("DC-BKP-01", "INFRA-1042", "Expand backup repository volume", "Budi Santoso", "Done"),
        ("DC-BKP-01", "INFRA-1188", "Firmware upgrade on backup appliance", "Jane Smith", "Open"),
        ("SEC-PROD-01", "SEC-2207", "Rotate vault seal keys", "Andi Pratama", "In Progress"),
        ("MON-PROD-01", "OPS-3391", "Increase Prometheus retention to 90d", "Siti Rahayu", "Done"),
    ]
    for server_name, jira_id, summary, executed_by, status in ticket_specs:
        await db.servers.update_one(
            {"name": server_name},
            {
                "$push": {
                    "tickets": {
                        "id": str(uuid.uuid4()),
                        "jira_id": jira_id,
                        "url": f"https://jira.company.com/browse/{jira_id}",
                        "summary": summary,
                        "executed_by": executed_by,
                        "status": status,
                        "requested_on": now.strftime("%Y-%m-%d"),
                        "created_at": now,
                        "updated_at": now,
                    }
                }
            },
        )

    print(
        f"Seeded {len(CATEGORY_SEEDS)} categories, {len(USER_SEEDS)} users, "
        f"{len(docs)} applications, {len(SERVER_SEEDS)} servers, {len(PIC_SEEDS)} PICs."
    )


if __name__ == "__main__":
    asyncio.run(seed())
