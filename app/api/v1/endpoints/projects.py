"""Project management endpoints."""
from typing import List
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_role
from app.core.exceptions import EntityNotFoundException, ForbiddenException
from app.database.session import get_db
from app.models.project import Project
from app.models.user import User, UserRole
from app.schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate
from app.schemas.common import PaginatedResponse

router = APIRouter()


@router.get("", response_model=PaginatedResponse[ProjectResponse])
def list_projects(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List projects accessible to the current user."""
    query = db.query(Project)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Project.owner_id == current_user.id)

    total = query.count()
    projects = query.offset((page - 1) * page_size).limit(page_size).all()
    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    items = []
    for p in projects:
        items.append(ProjectResponse(
            id=p.id,
            name=p.name,
            description=p.description,
            owner_id=p.owner_id,
            topologies_count=len(p.topologies),
            created_at=p.created_at,
            updated_at=p.updated_at
        ))

    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_in: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Create a new project."""
    project = Project(
        name=project_in.name,
        description=project_in.description,
        owner_id=current_user.id
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        topologies_count=0,
        created_at=project.created_at,
        updated_at=project.updated_at
    )


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get project details by ID."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise EntityNotFoundException("Project", project_id)

    if current_user.role != UserRole.ADMIN and project.owner_id != current_user.id:
        raise ForbiddenException("Access denied to this project")

    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        topologies_count=len(project.topologies),
        created_at=project.created_at,
        updated_at=project.updated_at
    )


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: int,
    project_in: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Update project details."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise EntityNotFoundException("Project", project_id)

    if current_user.role != UserRole.ADMIN and project.owner_id != current_user.id:
        raise ForbiddenException("Access denied to this project")

    if project_in.name is not None:
        project.name = project_in.name
    if project_in.description is not None:
        project.description = project_in.description

    db.commit()
    db.refresh(project)
    return ProjectResponse(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        topologies_count=len(project.topologies),
        created_at=project.created_at,
        updated_at=project.updated_at
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role([UserRole.ADMIN, UserRole.ENGINEER]))
):
    """Delete project and associated topologies."""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise EntityNotFoundException("Project", project_id)

    if current_user.role != UserRole.ADMIN and project.owner_id != current_user.id:
        raise ForbiddenException("Access denied to this project")

    db.delete(project)
    db.commit()
    return None
